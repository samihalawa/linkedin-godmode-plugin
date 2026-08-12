import { describe, expect, it, vi } from "vitest";
import { BrowserOperations, resolveLocator } from "../../src/browser.js";
import { tempConfig } from "../helpers.js";

describe("browser actions", () => {
  it("resolves all generic locator kinds", () => {
    const locator = { nth: vi.fn(() => "nth") };
    const page = {
      locator: vi.fn(() => locator), getByText: vi.fn(() => locator), getByLabel: vi.fn(() => locator),
      getByPlaceholder: vi.fn(() => locator), getByTestId: vi.fn(() => locator), getByRole: vi.fn(() => locator),
    };
    expect(resolveLocator(page as never, { kind: "css", value: "#x" })).toBe(locator);
    expect(resolveLocator(page as never, { kind: "xpath", value: "//button" })).toBe(locator);
    expect(resolveLocator(page as never, { kind: "text", value: "Go" })).toBe(locator);
    expect(resolveLocator(page as never, { kind: "label", value: "Email" })).toBe(locator);
    expect(resolveLocator(page as never, { kind: "placeholder", value: "Search" })).toBe(locator);
    expect(resolveLocator(page as never, { kind: "testid", value: "submit" })).toBe(locator);
    expect(resolveLocator(page as never, { kind: "role", value: "button", name: "Go", index: 1 })).toBe("nth");
    expect(page.getByRole).toHaveBeenCalledWith("button", { name: "Go" });
  });

  it("performs locator actions, post-checks page policy, and enforces read-only", async () => {
    const locator = { click: vi.fn(async () => undefined), fill: vi.fn(async () => undefined) };
    const page: Record<string, unknown> = {
      locator: vi.fn(() => locator), url: () => "https://example.com", waitForTimeout: vi.fn(async () => undefined),
    };
    page.context = () => ({ pages: () => [page] });
    const sessions = { getPage: () => page };
    const config = await tempConfig({ hostAllowlist: ["example.com"] });
    const browser = new BrowserOperations(sessions as never, config);
    await expect(browser.act({ locator: { kind: "css", value: "#x" }, action: "click" })).resolves.toMatchObject({ ok: true });
    await browser.act({ locator: { kind: "css", value: "#x" }, action: "fill", value: "hello" });
    expect(locator.click).toHaveBeenCalledOnce();
    expect(locator.fill).toHaveBeenCalledWith("hello", expect.objectContaining({ timeout: config.timeoutMs }));
    const readOnly = new BrowserOperations(sessions as never, { ...config, readOnly: true });
    await expect(readOnly.act({ locator: { kind: "css", value: "#x" }, action: "click" })).rejects.toMatchObject({ code: "POLICY_DENIED" });
  });

  it.each(["back", "forward", "reload"] as const)("post-validates %s navigation against the allowlist", async (operation) => {
    let currentUrl = "https://example.com/start";
    const page: Record<string, any> = {
      url: () => currentUrl,
      title: async () => "",
      goBack: async () => { currentUrl = "https://blocked.example/back"; return null; },
      goForward: async () => { currentUrl = "https://blocked.example/forward"; return null; },
      reload: async () => { currentUrl = "https://blocked.example/reload"; return null; },
      goto: async (url: string) => { currentUrl = url; return null; },
      waitForTimeout: async () => undefined,
    };
    page.context = () => ({ pages: () => [page] });
    const browser = new BrowserOperations({ getPage: () => page } as never, await tempConfig({ hostAllowlist: ["example.com"] }));
    await expect(browser.navigate({ operation })).rejects.toMatchObject({ code: "POLICY_DENIED" });
  });
});
