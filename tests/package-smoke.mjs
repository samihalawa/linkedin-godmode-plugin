import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = mkdtempSync(join(tmpdir(), "linkedin-godmode-package-smoke-"));
const packDir = join(root, "pack");
const cache = join(root, "npm-cache");
const temp = join(root, "tmp");
mkdirSync(packDir, { recursive: true }); mkdirSync(cache); mkdirSync(temp);
const env = { ...process.env, npm_config_cache: cache, npm_config_update_notifier: "false", TMPDIR: temp, LINKEDIN_GODMODE_STATE_DIR: join(root, "state"), LINKEDIN_GODMODE_PROFILE_DIR: join(root, "profiles") };

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: process.cwd(), env, encoding: "utf8", ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed (${result.status})\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result;
}

try {
  const packed = run("npm", ["pack", "--json", "--pack-destination", packDir]);
  const metadata = JSON.parse(packed.stdout)[0];
  const tarball = join(packDir, metadata.filename);
  const entries = run("tar", ["-tf", tarball]).stdout.trim().split("\n");
  const required = ["package/dist/cli.js", "package/dist/index.js", "package/.codex-plugin/plugin.json", "package/.mcp.json", "package/README.md", "package/SECURITY.md", "package/LICENSE", "package/skills/linkedin-operator/SKILL.md", "package/assets/readme/linkedin-godmode-hero.png", "package/assets/readme/mcp-workflow-screenshot.svg", "package/assets/readme/doctor-screenshot.svg"];
  for (const entry of required) if (!entries.includes(entry)) throw new Error(`tarball missing ${entry}`);
  const forbidden = entries.filter((entry) => /(^|\/)tests?(\/|$)|(^|\/)src(\/|$)|\.env(?:\.|$)|\.map$|\.pi-subagents/.test(entry));
  if (forbidden.length) throw new Error(`tarball contains forbidden files: ${forbidden.join(", ")}`);

  const consumer = join(root, "consumer"); mkdirSync(consumer);
  writeFileSync(join(consumer, "package.json"), '{"name":"packed-consumer","private":true}');
  run("npm", ["install", "--prefix", consumer, "--ignore-scripts=false", tarball]);
  const localBin = join(consumer, "node_modules", ".bin", "linkedin-godmode");
  if (!existsSync(localBin) || realpathSync(localBin) === localBin) throw new Error("local .bin is missing or not a symlink");
  run(localBin, ["--help"]);
  run(localBin, ["install-browser", "--", "--dry-run"], { env: { ...env, PLAYWRIGHT_BROWSERS_PATH: join(root, "dry-run-browsers") } });
  const real = run(localBin, ["session", '{"operation":"list"}']);
  const parsed = JSON.parse(real.stdout);
  if (parsed.ok !== true || !Array.isArray(parsed.result)) throw new Error("packed real command did not return a successful list");

  const prefix = join(root, "global");
  run("npm", ["install", "--global", "--prefix", prefix, tarball]);
  const globalBin = join(prefix, "bin", "linkedin-godmode");
  if (!existsSync(globalBin) || realpathSync(globalBin) === globalBin) throw new Error("global bin is missing or not a symlink");
  run(globalBin, ["--help"]);

  run("npx", ["--yes", "--package", tarball, "linkedin-godmode", "--help"]);
  if ((metadata.files ?? []).some((file) => file.path.endsWith(".map"))) throw new Error("pack metadata contains dangling maps");
  console.log(`PACKAGE_SMOKE_PASS files=${entries.length} local_bin=symlink global_bin=symlink npx=ok real_command=ok tarball=${metadata.filename}`);
} finally {
  rmSync(root, { recursive: true, force: true });
  try { chmodSync("dist/cli.js", 0o755); } catch {}
}
