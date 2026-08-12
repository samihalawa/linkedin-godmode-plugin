import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("packed npm bin", () => {
  it("executes through the installed .bin symlink and npx instead of silently no-oping", async () => {
    const root = await mkdtemp(join(resolve(".tmp-tests"), "godmode-packed-bin-"));
    roots.push(root);
    await writeFile(join(root, "package.json"), JSON.stringify({ private: true }));
    const packed = spawnSync("npm", ["pack", resolve("."), "--json", "--pack-destination", root], {
      cwd: root, encoding: "utf8", timeout: 60_000,
    });
    expect(packed.status, `${packed.stdout}\n${packed.stderr}`).toBe(0);
    const filename = (JSON.parse(packed.stdout) as Array<{ filename: string }>)[0]?.filename;
    expect(filename).toBeTruthy();

    const installed = spawnSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", join(root, filename!)], {
      cwd: root, encoding: "utf8", timeout: 120_000,
    });
    expect(installed.status, `${installed.stdout}\n${installed.stderr}`).toBe(0);

    const bin = join(root, "node_modules", ".bin", "linkedin-godmode");
    const environment = {
      ...process.env,
      LINKEDIN_GODMODE_STATE_DIR: join(root, "state"),
      LINKEDIN_GODMODE_PROFILE_DIR: join(root, "profiles"),
    };
    const help = spawnSync(bin, ["--help"], { cwd: root, encoding: "utf8", env: environment });
    expect(help.status, help.stderr).toBe(0);
    expect(help.stdout).toContain("linkedin-godmode mcp");

    const npx = spawnSync("npx", ["--no-install", "linkedin-godmode", "--help"], {
      cwd: root, encoding: "utf8", env: environment,
    });
    expect(npx.status, npx.stderr).toBe(0);
    expect(npx.stdout).toContain("linkedin-godmode call TOOL JSON");

    const safe = spawnSync(bin, ["session", '{"operation":"list"}'], { cwd: root, encoding: "utf8", env: environment });
    expect(safe.status, safe.stderr).toBe(0);
    expect(JSON.parse(safe.stdout)).toEqual({ ok: true, result: [] });
  }, 180_000);
});
