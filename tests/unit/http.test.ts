import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { HttpOperations, deriveCsrfToken } from "../../src/http.js";
import { tempConfig } from "../helpers.js";

let source: Server;
let target: Server;
let sourceUrl: string;
let targetUrl: string;
let targetHeaders: Record<string, string | string[] | undefined> = {};
let sameOriginHeaders: Record<string, string | string[] | undefined> = {};
let streamedBytes = 0;

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
}

beforeAll(async () => {
  target = createServer((request, response) => {
    targetHeaders = request.headers;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ headers: request.headers }));
  });
  targetUrl = await listen(target);
  source = createServer((request, response) => {
    if (request.url === "/redirect-cross") { response.writeHead(302, { location: targetUrl }); response.end(); return; }
    if (request.url === "/redirect-same") { response.writeHead(307, { location: "/same-target" }); response.end(); return; }
    if (request.url === "/same-target") { sameOriginHeaders = request.headers; response.end("ok"); return; }
    if (request.url === "/chunked") {
      response.setHeader("content-type", "text/plain");
      streamedBytes = 0;
      const chunk = Buffer.alloc(4096, "x");
      const timer = setInterval(() => {
        streamedBytes += chunk.length;
        if (streamedBytes >= 2_000_000) { clearInterval(timer); response.end(chunk); }
        else response.write(chunk);
      }, 1);
      response.on("close", () => clearInterval(timer));
      return;
    }
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      response.setHeader("content-type", "application/json");
      response.setHeader("set-cookie", "session=private");
      response.end(JSON.stringify({ method: request.method, body: Buffer.concat(chunks).toString("utf8"), contentType: request.headers["content-type"] }));
    });
  });
  source.on("connect", (_request, socket) => socket.end("HTTP/1.1 200 Connection Established\r\n\r\n"));
  sourceUrl = await listen(source);
});

afterAll(async () => {
  source.closeAllConnections(); target.closeAllConnections();
  await Promise.all([new Promise<void>((resolve) => source.close(() => resolve())), new Promise<void>((resolve) => target.close(() => resolve()))]);
});

describe("HTTP operations", () => {
  it("supports arbitrary uppercase methods, JSON/text/base64, URL-encoded, and multipart bodies", async () => {
    const http = new HttpOperations({} as never, await tempConfig({ hostAllowlist: ["127.0.0.1"] }));
    const purge = await http.request({ url: sourceUrl, method: "PURGE", responseType: "json" }) as { body: { method: string } };
    expect(purge.body.method).toBe("PURGE");
    const trace = await http.request({ url: sourceUrl, method: "TRACE", responseType: "json" }) as { body: { method: string } };
    expect(trace.body.method).toBe("TRACE");
    const connect = await http.request({ url: sourceUrl, method: "CONNECT", responseType: "none" }) as { status: number };
    expect(connect.status).toBe(200);
    const json = await http.request({ url: sourceUrl, method: "POST", body: { type: "json", value: { a: 1 } }, responseType: "json" }) as any;
    expect(json.body.body).toBe('{"a":1}');
    const text = await http.request({ url: sourceUrl, method: "PUT", body: { type: "text", value: "plain" }, responseType: "json" }) as any;
    expect(text.body.body).toBe("plain");
    const base64 = await http.request({ url: sourceUrl, method: "PATCH", body: { type: "base64", value: Buffer.from("binary").toString("base64") }, responseType: "json" }) as any;
    expect(base64.body.body).toBe("binary");
    const form = await http.request({ url: sourceUrl, method: "POST", body: { type: "form", fields: { a: "one", count: 2, tag: ["x", "y"] } }, responseType: "json" }) as any;
    expect(form.body.body).toBe("a=one&count=2&tag=x&tag=y");
    expect(form.body.contentType).toMatch(/^application\/x-www-form-urlencoded/);
    const multipart = await http.request({
      url: sourceUrl, method: "POST", responseType: "json",
      body: { type: "multipart", fields: { note: "hello" }, files: [{ field: "file", filename: "a.txt", contentType: "text/plain", dataBase64: Buffer.from("contents").toString("base64") }] },
    }) as any;
    expect(multipart.body.contentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(multipart.body.body).toContain('name="note"');
    expect(multipart.body.body).toContain('filename="a.txt"');
    expect(multipart.body.body).toContain("contents");
  });

  it("manually follows redirects, checks each hop, strips cross-origin secrets, and recomputes cookies", async () => {
    process.env.TEST_API_KEY = "ENV_SECRET_MARKER";
    const context = {
      cookies: async (url: string) => [{ name: url.startsWith(targetUrl) ? "target_cookie" : "source_cookie", value: url.startsWith(targetUrl) ? "target-value" : "source-value" }],
    };
    const http = new HttpOperations({ get: () => ({ lease: { context } }) } as never, await tempConfig({ hostAllowlist: ["127.0.0.1"] }));
    const result = await http.request({
      url: `${sourceUrl}/redirect-cross`, sessionId: "s", responseType: "json",
      headers: {
        Authorization: "Bearer LEAK", "Proxy-Authorization": "Basic LEAK", "csrf-token": "LEAK-CSRF",
        "x-api-key": "LEAK-KEY", "x-client-secret": "LEAK-CLIENT", "x-env-value": "ENV_SECRET_MARKER",
        Origin: sourceUrl, "x-ordinary": "kept",
      },
    }) as { status: number };
    expect(result.status).toBe(200);
    expect(targetHeaders.authorization).toBeUndefined();
    expect(targetHeaders["proxy-authorization"]).toBeUndefined();
    expect(targetHeaders["csrf-token"]).toBeUndefined();
    expect(targetHeaders["x-api-key"]).toBeUndefined();
    expect(targetHeaders["x-client-secret"]).toBeUndefined();
    expect(targetHeaders["x-env-value"]).toBeUndefined();
    expect(targetHeaders.origin).toBeUndefined();
    expect(targetHeaders["x-ordinary"]).toBe("kept");
    expect(targetHeaders.cookie).toBe("target_cookie=target-value");
    expect(String(targetHeaders.cookie)).not.toContain("source_cookie");
    delete process.env.TEST_API_KEY;
  });

  it("retains credentials on same-origin redirects", async () => {
    const http = new HttpOperations({} as never, await tempConfig({ hostAllowlist: ["127.0.0.1"] }));
    await http.request({ url: `${sourceUrl}/redirect-same`, headers: { Authorization: "Bearer SAME", "x-ordinary": "yes" }, responseType: "text" });
    expect(sameOriginHeaders.authorization).toBe("Bearer SAME");
    expect(sameOriginHeaders["x-ordinary"]).toBe("yes");
  });

  it("aborts a chunked response near the configured cap instead of buffering it all", async () => {
    const http = new HttpOperations({} as never, await tempConfig({ hostAllowlist: ["127.0.0.1"], maxResponseBytes: 16_384 }));
    await expect(http.request({ url: `${sourceUrl}/chunked`, maxResponseBytes: 16_384 })).rejects.toMatchObject({ code: "OUTPUT_TOO_LARGE" });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(streamedBytes).toBeLessThan(2_000_000);
    expect(streamedBytes).toBeLessThanOrEqual(128_000);
  });

  it("enforces allowlist/read-only and rejects literal Cookie", async () => {
    const config = await tempConfig({ hostAllowlist: ["127.0.0.1"] });
    const http = new HttpOperations({} as never, config);
    await expect(http.request({ url: "https://example.com" })).rejects.toMatchObject({ code: "POLICY_DENIED" });
    await expect(http.request({ url: sourceUrl, headers: { CoOkIe: "x=y" } })).rejects.toMatchObject({ code: "POLICY_DENIED" });
    await expect(new HttpOperations({} as never, { ...config, readOnly: true }).request({ url: sourceUrl, method: "DELETE" })).rejects.toMatchObject({ code: "POLICY_DENIED" });
    expect(deriveCsrfToken('"ajax:123"')).toBe("ajax:123");
  });
});
