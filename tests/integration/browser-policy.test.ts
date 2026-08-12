import { access } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GodmodeRuntime } from "../../src/runtime.js";
import { tempConfig } from "../helpers.js";

let fixture: Server;
let allowedUrl: string;
let deniedUrl: string;
let browserAvailable = true;

try { await access(chromium.executablePath()); } catch { browserAvailable = false; }

beforeAll(async () => {
  fixture = createServer((request, response) => {
    if (request.url === "/redirect-denied") {
      response.writeHead(302, { location: `${deniedUrl}/denied` });
      response.end();
      return;
    }
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<!doctype html><html><head><title>Policy fixture</title></head><body>
      <a id="link-denied" href="${deniedUrl}/denied">blocked link</a>
      <a id="popup-denied" target="_blank" href="${deniedUrl}/denied">blocked popup</a>
      <p>${request.url}</p>
    </body></html>`);
  });
  await new Promise<void>((resolve) => fixture.listen(0, "127.0.0.1", resolve));
  const port = (fixture.address() as AddressInfo).port;
  allowedUrl = `http://127.0.0.1:${port}`;
  deniedUrl = `http://localhost:${port}`;
});

afterAll(async () => new Promise<void>((resolve) => fixture.close(() => resolve())));

async function expectDenied(runtime: GodmodeRuntime, tool: string, input: unknown): Promise<void> {
  const result = await runtime.safeCall(tool, input);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe("POLICY_DENIED");
}

describe("browser context allowlist enforcement", () => {
  it.skipIf(!browserAvailable)("blocks initialUrl, page_create, goto, redirects, links, popups, JS navigation, history, and reload", async () => {
    const config = await tempConfig({ hostAllowlist: ["127.0.0.1"], timeoutMs: 5_000 });
    const runtime = new GodmodeRuntime(config);
    try {
      await expectDenied(runtime, "browser_session", {
        operation: "create", sessionId: "bad-initial", provider: "local", profile: "bad-initial", headless: true, initialUrl: deniedUrl,
      });
      await expectDenied(runtime, "browser_session", {
        operation: "create", sessionId: "redirect-initial", provider: "local", profile: "redirect-initial", headless: true,
        initialUrl: `${allowedUrl}/redirect-denied`,
      });

      const opened = await runtime.call("browser_session", {
        operation: "create", sessionId: "policy", provider: "local", profile: "policy", headless: true, initialUrl: `${allowedUrl}/home`,
      }) as { pages: Array<{ pageId: string }> };
      const primaryPageId = opened.pages[0]!.pageId;
      await expectDenied(runtime, "browser_session", { operation: "page_create", sessionId: "policy", url: deniedUrl });
      await expectDenied(runtime, "browser_navigate", { sessionId: "policy", pageId: primaryPageId, operation: "goto", url: deniedUrl });
      await expectDenied(runtime, "browser_navigate", { sessionId: "policy", pageId: primaryPageId, operation: "goto", url: `${allowedUrl}/redirect-denied` });

      await runtime.call("browser_navigate", { sessionId: "policy", pageId: primaryPageId, operation: "goto", url: `${allowedUrl}/links` });
      await expectDenied(runtime, "browser_act", {
        sessionId: "policy", pageId: primaryPageId, locator: { kind: "css", value: "#link-denied" }, action: "click",
      });
      await expectDenied(runtime, "browser_evaluate", {
        sessionId: "policy", pageId: primaryPageId, source: `location.href = ${JSON.stringify(`${deniedUrl}/from-js`)}; return true;`,
      });
      await expectDenied(runtime, "browser_act", {
        sessionId: "policy", pageId: primaryPageId, locator: { kind: "css", value: "#popup-denied" }, action: "click",
      });
      const managed = runtime.sessions.get("policy");
      const primary = managed.lease.context.pages()[0]!;
      for (const page of managed.lease.context.pages()) if (page !== primary) await page.close();

      config.hostAllowlist.length = 0;
      await runtime.call("browser_navigate", { sessionId: "policy", pageId: primaryPageId, operation: "goto", url: `${deniedUrl}/history-back` });
      await runtime.call("browser_navigate", { sessionId: "policy", pageId: primaryPageId, operation: "goto", url: `${allowedUrl}/after-denied` });
      config.hostAllowlist.push("127.0.0.1");
      await expectDenied(runtime, "browser_navigate", { sessionId: "policy", pageId: primaryPageId, operation: "back" });

      config.hostAllowlist.length = 0;
      const forwardPage = await runtime.call("browser_session", {
        operation: "page_create", sessionId: "policy", url: `${allowedUrl}/forward-start`,
      }) as { pageId: string };
      await runtime.call("browser_navigate", { sessionId: "policy", pageId: forwardPage.pageId, operation: "goto", url: `${deniedUrl}/history-forward` });
      await runtime.call("browser_navigate", { sessionId: "policy", pageId: forwardPage.pageId, operation: "back" });
      config.hostAllowlist.push("127.0.0.1");
      await expectDenied(runtime, "browser_navigate", { sessionId: "policy", pageId: forwardPage.pageId, operation: "forward" });
      await runtime.call("browser_session", { operation: "page_close", sessionId: "policy", pageId: forwardPage.pageId });

      config.hostAllowlist.length = 0;
      const reloadPage = await runtime.call("browser_session", {
        operation: "page_create", sessionId: "policy", url: `${deniedUrl}/reload-denied`,
      }) as { pageId: string };
      config.hostAllowlist.push("127.0.0.1");
      await expectDenied(runtime, "browser_navigate", { sessionId: "policy", pageId: reloadPage.pageId, operation: "reload" });
      await managed.lease.context.pages().find((page) => page.url().includes("reload-denied"))?.close();
    } finally {
      await runtime.close();
    }
  });
});
