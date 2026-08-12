import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = mkdtempSync(join(tmpdir(), "linkedin-godmode-consumer-smoke-"));
const packDir = join(root, "pack");
const consumer = join(root, "consumer");
const browsers = join(root, "browsers");
mkdirSync(packDir, { recursive: true });
mkdirSync(consumer);
writeFileSync(join(consumer, "package.json"), '{"name":"fresh-linkedin-godmode-consumer","private":true}');
const env = {
  ...process.env,
  PLAYWRIGHT_BROWSERS_PATH: browsers,
  LINKEDIN_GODMODE_STATE_DIR: join(root, "state"),
  LINKEDIN_GODMODE_PROFILE_DIR: join(root, "profiles"),
  npm_config_cache: join(root, "npm-cache"),
  npm_config_update_notifier: "false",
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", env, ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed (${result.status})\n${result.stdout}\n${result.stderr}`);
  return result;
}

try {
  const packed = JSON.parse(run("npm", ["pack", "--json", "--pack-destination", packDir], { cwd: process.cwd() }).stdout)[0];
  const tarball = join(packDir, packed.filename);
  run("npm", ["install", "--prefix", consumer, tarball]);
  const binary = join(consumer, "node_modules", ".bin", "linkedin-godmode");
  if (!existsSync(binary)) throw new Error("fresh consumer binary is missing");

  const before = spawnSync(binary, ["doctor"], { encoding: "utf8", env });
  if (before.status !== 1 || JSON.parse(before.stdout).browserExecutable !== false) throw new Error("clean consumer did not begin with a missing browser");
  run(binary, ["install-browser"]);
  const after = JSON.parse(run(binary, ["doctor"]).stdout);
  if (after.ok !== true || after.browserExecutable !== true || after.remediation !== undefined) throw new Error("browser install did not make doctor ready");

  const transport = new StdioClientTransport({ command: binary, args: ["mcp"], env, stderr: "pipe" });
  const client = new Client({ name: "published-consumer-smoke", version: "1.0.0" });
  await client.connect(transport);
  try {
    const tools = await client.listTools();
    if (tools.tools.length !== 9) throw new Error(`expected 9 MCP tools, received ${tools.tools.length}`);
    const open = await client.callTool({ name: "browser_session", arguments: { operation: "create", sessionId: "consumer", provider: "local", profile: "consumer", headless: true, initialUrl: "https://example.com/" } });
    if (open.isError) throw new Error(`browser open failed: ${JSON.stringify(open.content)}`);
    const capture = await client.callTool({ name: "browser_capture", arguments: { sessionId: "consumer", format: "text" } });
    if (capture.isError || !JSON.stringify(capture.content).includes("Example Domain")) throw new Error(`browser capture failed: ${JSON.stringify(capture.content)}`);
    const close = await client.callTool({ name: "browser_session", arguments: { operation: "close", sessionId: "consumer" } });
    if (close.isError) throw new Error(`browser close failed: ${JSON.stringify(close.content)}`);
  } finally {
    await client.close();
  }
  console.log(`CONSUMER_SMOKE_PASS version=${packed.version} tools=9 browser=installed flow=open-capture-close`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
