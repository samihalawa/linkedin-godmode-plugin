import { access, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GodmodeRuntime } from "../../src/runtime.js";
import { tempConfig } from "../helpers.js";

let fixture: Server;
let baseUrl: string;
let blockedUrl: string;
let browserAvailable = true;
try { await access(chromium.executablePath()); } catch { browserAvailable = false; }

beforeAll(async () => {
  fixture = createServer((request, response) => {
    if (request.url === "/api") { response.setHeader("content-type", "application/json"); response.end(JSON.stringify({ ok: true, method: request.method })); return; }
    if (request.url === "/chunked") {
      response.setHeader("content-type", "text/plain");
      let sent = 0;
      const timer = setInterval(() => {
        if (sent >= 128 * 1024) { clearInterval(timer); response.end(); return; }
        response.write(Buffer.alloc(4096, "z")); sent += 4096;
      }, 2);
      response.on("close", () => clearInterval(timer));
      return;
    }
    if (request.url === "/redirect-blocked") { response.writeHead(302, { location: `${blockedUrl}/blocked-final` }); response.end(); return; }
    const title = request.url === "/second" ? "Second" : "Fixture";
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<!doctype html><html><head><title>${title}</title></head><body>
      <label>Name <input aria-label="Name" /></label><button id="go">Go</button><div id="result"></div>
      <a id="blocked-link" href="${blockedUrl}/blocked-link">Blocked link</a>
      <form id="blocked-form" method="get" action="${blockedUrl}/blocked-form"><button id="submit" type="submit">Submit blocked</button></form>
      <button id="popup" onclick="window.open('${blockedUrl}/blocked-popup','_blank')">Blocked popup</button>
      <script>document.querySelector('#go').addEventListener('click',()=>{document.querySelector('#result').textContent='clicked:'+document.querySelector('input').value})</script>
    </body></html>`);
  });
  await new Promise<void>((resolve) => fixture.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(fixture.address() as AddressInfo).port}`;
  blockedUrl = baseUrl.replace("127.0.0.1", "localhost");
});

afterAll(async () => new Promise<void>((resolve) => { fixture.closeAllConnections(); fixture.close(() => resolve()); }));

describe("local Playwright persistent integration", () => {
  it.skipIf(!browserAvailable)("enforces initial/page/redirect/link/form/popup/evaluate/history/reload policy and completes generic flows", async () => {
    const config = await tempConfig({ hostAllowlist: ["127.0.0.1"], maxOutputBytes: 3_000_000 });
    const runtime = new GodmodeRuntime(config);
    try {
      await expect(runtime.call("browser_session", { operation: "create", sessionId: "blocked", provider: "local", profile: "blocked", headless: true, initialUrl: blockedUrl })).rejects.toMatchObject({ code: "POLICY_DENIED" });
      const opened = await runtime.call("browser_session", { operation: "create", sessionId: "local", provider: "local", profile: "persistent", headless: true, initialUrl: baseUrl }) as { pages: Array<{ pageId: string }> };
      const pageId = opened.pages[0]!.pageId;
      await expect(runtime.call("browser_session", { operation: "page_create", sessionId: "local", url: blockedUrl })).rejects.toMatchObject({ code: "POLICY_DENIED" });
      await expect(runtime.call("browser_navigate", { sessionId: "local", pageId, operation: "goto", url: `${baseUrl}/redirect-blocked` })).rejects.toMatchObject({ code: "POLICY_DENIED" });
      await runtime.call("browser_navigate", { sessionId: "local", pageId, operation: "goto", url: baseUrl });

      for (const selector of ["#blocked-link", "#submit", "#popup"]) {
        await expect(runtime.call("browser_act", { sessionId: "local", pageId, locator: { kind: "css", value: selector }, action: "click" })).rejects.toMatchObject({ code: "POLICY_DENIED" });
        await runtime.call("browser_navigate", { sessionId: "local", pageId, operation: "goto", url: baseUrl });
      }
      await expect(runtime.call("browser_evaluate", { sessionId: "local", pageId, source: `location.href=${JSON.stringify(`${blockedUrl}/evaluate`)}; return true;` })).rejects.toMatchObject({ code: "POLICY_DENIED" });

      const pages = await runtime.call("browser_session", { operation: "page_list", sessionId: "local" }) as Array<{ pageId: string }>;
      for (const popup of pages.filter((page) => page.pageId !== pageId)) await runtime.call("browser_session", { operation: "page_close", sessionId: "local", pageId: popup.pageId });
      await runtime.call("browser_navigate", { sessionId: "local", pageId, operation: "goto", url: baseUrl });
      await runtime.call("browser_navigate", { sessionId: "local", pageId, operation: "goto", url: `${baseUrl}/second` });
      expect(await runtime.call("browser_navigate", { sessionId: "local", pageId, operation: "back" })).toMatchObject({ url: `${baseUrl}/` });
      expect(await runtime.call("browser_navigate", { sessionId: "local", pageId, operation: "forward" })).toMatchObject({ url: `${baseUrl}/second` });
      expect(await runtime.call("browser_navigate", { sessionId: "local", pageId, operation: "reload" })).toMatchObject({ url: `${baseUrl}/second` });

      await runtime.call("browser_navigate", { sessionId: "local", pageId, operation: "goto", url: baseUrl });
      await runtime.call("browser_act", { sessionId: "local", pageId, locator: { kind: "label", value: "Name" }, action: "fill", value: "Alice" });
      await runtime.call("browser_act", { sessionId: "local", pageId, locator: { kind: "css", value: "#go" }, action: "click" });
      expect((await runtime.call("browser_capture", { sessionId: "local", pageId, format: "text" }) as { data: string }).data).toContain("clicked:Alice");
      expect((await runtime.call("browser_capture", { sessionId: "local", pageId, format: "html" }) as { data: string }).data).toContain("<title>Fixture</title>");
      expect((await runtime.call("browser_capture", { sessionId: "local", pageId, format: "accessibility" }) as { data: string }).data).toContain("button");
      expect((await runtime.call("browser_capture", { sessionId: "local", pageId, format: "screenshot" }) as { data: string }).data.length).toBeGreaterThan(100);

      expect(await runtime.call("browser_evaluate", { sessionId: "local", pageId, source: "localStorage.setItem('persisted','yes'); return document.title;" })).toBe("Fixture");
      const started = await runtime.call("browser_network", { operation: "start", sessionId: "local", pageId, includeBodies: true, maxBodyBytes: 4096, maxTotalBytes: 8192, maxPendingTasks: 8 }) as { bodyMode: string };
      expect(started.bodyMode).toBe("stream");
      expect(await runtime.call("browser_evaluate", { sessionId: "local", pageId, source: "const r=await fetch('/api'); return r.json();" })).toEqual({ ok: true, method: "GET" });
      await runtime.call("browser_evaluate", { sessionId: "local", pageId, source: "const r=await fetch('/chunked'); return (await r.text()).length;" });
      await new Promise((resolve) => setTimeout(resolve, 50));
      const network = await runtime.call("browser_network", { operation: "read", sessionId: "local", pageId }) as { records: Array<any> };
      const apiRecord = network.records.find((record) => record.url.includes("/api") && record.status === 200);
      expect(apiRecord).toBeDefined();
      expect(apiRecord.responseBody).toMatchObject({ truncated: false });
      expect(apiRecord.responseBody.data, JSON.stringify(apiRecord)).toContain('"ok":true');
      const chunked = network.records.find((record) => record.url.includes("/chunked"));
      expect(chunked).toBeDefined();
      expect(chunked.responseBody?.truncated).toBe(true);
      expect(Buffer.byteLength(chunked.responseBody?.data ?? "", chunked.responseBody?.encoding === "base64" ? "base64" : "utf8")).toBeLessThanOrEqual(4096);
      await runtime.call("browser_network", { operation: "stop", sessionId: "local", pageId });

      const http = await runtime.call("http_request", { url: `${baseUrl}/api`, method: "POST", sessionId: "local", body: { type: "json", value: { x: 1 } }, responseType: "json" }) as { body: { ok: boolean; method: string } };
      expect(http.body).toEqual({ ok: true, method: "POST" });
    } finally {
      await runtime.close();
    }

    const second = new GodmodeRuntime(config);
    try {
      await second.call("browser_session", { operation: "create", sessionId: "local-2", provider: "local", profile: "persistent", headless: true, initialUrl: baseUrl });
      expect(await second.call("browser_evaluate", { sessionId: "local-2", source: "return localStorage.getItem('persisted');" })).toBe("yes");
    } finally {
      await second.close();
      await rm(config.stateDir, { recursive: true, force: true });
    }
  });
});
