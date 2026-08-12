import { describe, expect, it } from "vitest";
import {
  BrowserActInputSchema, BrowserNetworkInputSchema, BrowserSessionInputSchema, BrowserTaskInputSchema, HttpRequestInputSchema,
} from "../../src/schemas.js";
import { TOOL_NAMES } from "../../src/runtime.js";

describe("schemas and registry", () => {
  it("uses flat discoverable operation schemas with strict operation validation", () => {
    expect(BrowserSessionInputSchema.parse({ operation: "create", provider: "local", profile: "p" }).provider).toBe("local");
    expect(BrowserNetworkInputSchema.parse({ operation: "start", maxTotalBytes: 1000, maxPendingTasks: 2 }).maxTotalBytes).toBe(1000);
    expect(BrowserTaskInputSchema.parse({ operation: "run", provider: "anchor", task: "x", agent: "openai-cua", providerName: "openai" }).agent).toBe("openai-cua");
    expect(() => BrowserSessionInputSchema.parse({ operation: "list", unexpected: true })).toThrow();
    expect(() => BrowserSessionInputSchema.parse({ operation: "list", initialUrl: "https://example.com" })).toThrow();
    expect(() => BrowserNetworkInputSchema.parse({ operation: "read", maxBodyBytes: 10 })).toThrow();
  });

  it("validates official Anchor enums before provider calls", () => {
    expect(() => BrowserTaskInputSchema.parse({ operation: "run", provider: "anchor", task: "x", agent: "invented" })).toThrow();
    expect(() => BrowserTaskInputSchema.parse({ operation: "run", provider: "anchor", task: "x", providerName: "invented" })).toThrow();
  });

  it("accepts arbitrary uppercase HTTP tokens and structured forms", () => {
    for (const method of ["GET", "CONNECT", "TRACE", "PROPFIND", "PURGE", "X-CUSTOM", "M-SEARCH"]) {
      expect(HttpRequestInputSchema.parse({ url: "https://example.com", method }).method).toBe(method);
    }
    expect(() => HttpRequestInputSchema.parse({ url: "https://example.com", method: "lowercase" })).toThrow();
    expect(HttpRequestInputSchema.parse({ url: "https://example.com", method: "POST", body: { type: "form", fields: { a: 1 } } }).body?.type).toBe("form");
    expect(HttpRequestInputSchema.parse({ url: "https://example.com", method: "POST", body: { type: "multipart", fields: { a: "b" } } }).body?.type).toBe("multipart");
    expect(() => HttpRequestInputSchema.parse({ url: "https://example.com", method: "GET", body: { type: "text", value: "x" } })).toThrow();
  });

  it("accepts generic locators and contains only generic tool names", () => {
    expect(BrowserActInputSchema.parse({ action: "click", locator: { kind: "role", value: "button", name: "Go" } }).action).toBe("click");
    expect(TOOL_NAMES).toEqual([
      "browser_session", "http_request", "browser_navigate", "browser_act", "browser_evaluate",
      "browser_capture", "browser_network", "browser_task", "doctor",
    ]);
    const forbidden = /(message|chat|job|apply|connect|invite|reaction|like|post|profile|campaign|follow)/i;
    for (const name of TOOL_NAMES) expect(name).not.toMatch(forbidden);
  });
});
