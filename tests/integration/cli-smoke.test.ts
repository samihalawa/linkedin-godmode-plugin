import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function environment(root: string, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { ...process.env, LINKEDIN_GODMODE_STATE_DIR: join(root, "state"), LINKEDIN_GODMODE_PROFILE_DIR: join(root, "profiles"), ...extra };
}

function run(root: string, args: string[], options: { input?: string; env?: NodeJS.ProcessEnv } = {}) {
  return spawnSync(process.execPath, [resolve("dist/cli.js"), ...args], { input: options.input, encoding: "utf8", env: environment(root, options.env) });
}

describe("CLI smoke and exit semantics", () => {
  it("prints JSON doctor output and exits nonzero when doctor ok:false", async () => {
    const root = await mkdtemp(join(resolve(".tmp-tests"), "godmode-cli-")); roots.push(root);
    const result = run(root, ["doctor"], { env: { PLAYWRIGHT_BROWSERS_PATH: join(root, "missing-browsers") } });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, browserExecutable: false });
    expect(result.stderr).toBe("");
  });

  it("returns nonzero for failed one-shot, batch, and run while preserving JSON stdout", async () => {
    const root = await mkdtemp(join(resolve(".tmp-tests"), "godmode-failures-")); roots.push(root);
    const oneShot = run(root, ["call", "browser_session", '{"operation":"status","sessionId":"missing"}']);
    expect(oneShot.status).toBe(1);
    expect(JSON.parse(oneShot.stdout)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(oneShot.stderr).toBe("");

    const lines = [
      JSON.stringify({ id: "ok", tool: "browser_session", arguments: { operation: "list" } }),
      JSON.stringify({ id: "bad", tool: "browser_session", arguments: { operation: "status", sessionId: "missing" } }),
    ].join("\n");
    const batch = run(root, ["batch", "-"], { input: `${lines}\n` });
    expect(batch.status).toBe(1);
    const outputs = batch.stdout.trim().split("\n").map((line) => JSON.parse(line));
    expect(outputs).toHaveLength(2);
    expect(outputs[0]).toEqual({ id: "ok", ok: true, result: [] });
    expect(outputs[1]).toMatchObject({ id: "bad", ok: false, error: { code: "NOT_FOUND" } });
    expect(batch.stderr).toBe("");

    const runFile = join(root, "run.json");
    await writeFile(runFile, JSON.stringify({ steps: [
      { id: 1, tool: "browser_session", arguments: { operation: "list" } },
      { id: 2, tool: "missing_tool", arguments: {} },
    ] }));
    const runResult = run(root, ["run", runFile]);
    expect(runResult.status).toBe(1);
    expect(JSON.parse(runResult.stdout)).toEqual(expect.arrayContaining([expect.objectContaining({ id: 2, ok: false })]));
    expect(runResult.stderr).toBe("");
  });

  it("runs a successful deterministic batch and real one-shot command without AI", async () => {
    const root = await mkdtemp(join(resolve(".tmp-tests"), "godmode-success-")); roots.push(root);
    const line = JSON.stringify({ id: "list", tool: "browser_session", arguments: { operation: "list" } });
    const batch = run(root, ["batch", "-"], { input: `${line}\n` });
    expect(batch.status, batch.stderr).toBe(0);
    expect(JSON.parse(batch.stdout)).toEqual({ id: "list", ok: true, result: [] });
    const command = run(root, ["session", '{"operation":"list"}']);
    expect(command.status, command.stderr).toBe(0);
    expect(JSON.parse(command.stdout)).toEqual({ ok: true, result: [] });
  });
});
