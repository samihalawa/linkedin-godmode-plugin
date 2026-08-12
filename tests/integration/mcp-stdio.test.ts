import { access, mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));
let browserAvailable = true;
try { await access(chromium.executablePath()); } catch { browserAvailable = false; }

function env(root: string): Record<string, string> {
  return {
    ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
    LINKEDIN_GODMODE_STATE_DIR: join(root, "state"), LINKEDIN_GODMODE_PROFILE_DIR: join(root, "profiles"),
    DEBUG: "*", DEBUG_FD: "1", BROWSERBASE_API_KEY: "MCP_DEBUG_SECRET_MARKER",
  };
}

async function connect(root: string) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve("dist/cli.js"), "mcp"], env: env(root), stderr: "pipe" });
  const client = new Client({ name: "smoke-client", version: "1.0.0" });
  await client.connect(transport);
  return { client, transport };
}

describe("MCP stdio", () => {
  it("keeps stdout protocol-clean and exposes exact discoverable flat schemas", async () => {
    const root = await mkdtemp(join(resolve(".tmp-tests"), "godmode-mcp-")); roots.push(root);
    const { client } = await connect(root);
    try {
      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name)).toEqual([
        "browser_session", "http_request", "browser_navigate", "browser_act", "browser_evaluate",
        "browser_capture", "browser_network", "browser_task", "doctor",
      ]);
      for (const tool of listed.tools) {
        expect(tool.inputSchema.type, tool.name).toBe("object");
        expect(Object.keys(tool.inputSchema.properties ?? {}).length, tool.name).toBeGreaterThan(0);
      }
      const expected: Record<string, { operation: string[]; properties: string[] }> = {
        browser_session: {
          operation: ["create", "attach", "list", "status", "close", "page_create", "page_list", "page_close"],
          properties: ["operation", "sessionId", "provider", "profile", "providerSessionId", "persistentRef", "headless", "initialUrl", "keepAlive", "timeoutSeconds", "terminate", "url", "pageId"],
        },
        browser_network: {
          operation: ["start", "read", "clear", "stop"],
          properties: ["operation", "sessionId", "pageId", "includeBodies", "maxEntries", "maxBodyBytes", "maxTotalBytes", "maxPendingTasks", "clear"],
        },
        browser_task: {
          operation: ["run", "status"],
          properties: ["operation", "provider", "task", "taskId", "sessionId", "url", "async", "resultSchema", "agentId", "agent", "providerName", "model", "maxSteps", "detectElements", "highlightElements", "humanIntervention", "variables"],
        },
      };
      for (const [name, specification] of Object.entries(expected)) {
        const schema = listed.tools.find((tool) => tool.name === name)?.inputSchema as any;
        expect(schema.type).toBe("object");
        expect(schema.required).toContain("operation");
        expect(schema.properties.operation.enum).toEqual(specification.operation);
        expect(Object.keys(schema.properties)).toEqual(specification.properties);
        expect(schema.additionalProperties).toBe(false);
      }
      const result = await client.callTool({ name: "doctor", arguments: {} });
      expect(result.isError).not.toBe(true);
      expect(JSON.stringify(result.content)).toContain("browserExecutable");
      expect(JSON.stringify(result.content)).not.toContain("MCP_DEBUG_SECRET_MARKER");
    } finally {
      await client.close();
    }
  });

  it.skipIf(!browserAvailable)("closes runtime sessions on EOF/transport close so profile locks are released", async () => {
    const root = await mkdtemp(join(resolve(".tmp-tests"), "godmode-mcp-eof-")); roots.push(root);
    const { client } = await connect(root);
    const opened = await client.callTool({ name: "browser_session", arguments: { operation: "create", sessionId: "s", provider: "local", profile: "eof-profile", headless: true } });
    expect(opened.isError).not.toBe(true);
    await client.close();
    const command = spawnSync(process.execPath, [resolve("dist/cli.js"), "session", JSON.stringify({ operation: "create", sessionId: "reopen", provider: "local", profile: "eof-profile", headless: true })], { encoding: "utf8", env: env(root) });
    expect(command.status, command.stderr).toBe(0);
  });

  it.skipIf(!browserAvailable)("handles SIGTERM with bounded graceful cleanup", async () => {
    const root = await mkdtemp(join(resolve(".tmp-tests"), "godmode-mcp-signal-")); roots.push(root);
    const { client, transport } = await connect(root);
    await client.callTool({ name: "browser_session", arguments: { operation: "create", sessionId: "s", provider: "local", profile: "signal-profile", headless: true } });
    const pid = transport.pid;
    expect(pid).toBeTypeOf("number");
    process.kill(pid!, "SIGTERM");
    const deadline = Date.now() + 7_000;
    while (Date.now() < deadline) {
      try { process.kill(pid!, 0); await new Promise((resolve) => setTimeout(resolve, 50)); }
      catch { break; }
    }
    expect(() => process.kill(pid!, 0)).toThrow();
    await client.close().catch(() => undefined);
  });
});
