import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const events: string[] = [];
  const page = { goto: vi.fn(async () => { events.push("goto"); }), url: () => "about:blank", on: vi.fn() };
  const context = {
    pages: vi.fn(() => [page]), newPage: vi.fn(async () => page), close: vi.fn(async () => undefined),
    route: vi.fn(async () => { events.push("route"); }), on: vi.fn(),
  };
  const browser = { contexts: vi.fn(() => [context]), close: vi.fn(async () => undefined) };
  return {
    events, page, context, browser, connectOverCDP: vi.fn(async () => browser),
    bbContextCreate: vi.fn(), bbSessionCreate: vi.fn(), bbSessionRetrieve: vi.fn(), bbSessionUpdate: vi.fn(),
    anchorCreate: vi.fn(), anchorDelete: vi.fn(), anchorConnect: vi.fn(async () => browser),
  };
});

vi.mock("playwright", () => ({ chromium: { connectOverCDP: mocks.connectOverCDP, launchPersistentContext: vi.fn(async () => mocks.context) } }));
vi.mock("@browserbasehq/sdk", () => ({
  default: class BrowserbaseMock { contexts = { create: mocks.bbContextCreate }; sessions = { create: mocks.bbSessionCreate, retrieve: mocks.bbSessionRetrieve, update: mocks.bbSessionUpdate }; },
}));
vi.mock("anchorbrowser", () => ({
  Sessions: { createSession: mocks.anchorCreate, deleteSession: mocks.anchorDelete },
  connectBrowser: mocks.anchorConnect, createAnchorbrowserClient: vi.fn(() => ({ anchorClient: true })),
}));

import { AnchorProvider, BrowserbaseProvider } from "../../src/providers.js";
import { tempConfig } from "../helpers.js";

const ORIGINAL = { ...process.env };
beforeEach(() => {
  vi.clearAllMocks();
  process.env.BROWSERBASE_API_KEY = "bb-test";
  process.env.ANCHOR_API_KEY = "anchor-test";
  mocks.bbContextCreate.mockResolvedValue({ id: "context-1" });
  mocks.bbSessionCreate.mockResolvedValue({ id: "bb-session", connectUrl: "wss://redacted", contextId: "context-1" });
  mocks.bbSessionRetrieve.mockResolvedValue({ id: "bb-attached", connectUrl: "wss://attached", contextId: "context-attached" });
  mocks.bbSessionUpdate.mockResolvedValue({});
  mocks.anchorCreate.mockResolvedValue({ data: { id: "anchor-session", cdp_url: "wss://redacted" } });
  mocks.anchorDelete.mockResolvedValue({ data: { status: "closed" } });
});
afterEach(() => { process.env = { ...ORIGINAL }; });

describe("provider session request shapes and ownership", () => {
  it("propagates Browserbase allowedDomains, installs policy, and releases owned sessions", async () => {
    const config = await tempConfig({ hostAllowlist: ["example.com", "*.linkedin.com"], browserbase: { projectId: "project-1", region: "eu-central-1" } });
    const lease = await new BrowserbaseProvider(config).open({ profile: "p", headless: true, keepAlive: true, timeoutSeconds: 120, attach: false });
    expect(mocks.bbSessionCreate).toHaveBeenCalledWith({
      projectId: "project-1", region: "eu-central-1", timeout: 120, keepAlive: true,
      browserSettings: { context: { id: "context-1", persist: true }, allowedDomains: ["example.com", "linkedin.com"] },
    });
    expect(mocks.events.indexOf("route")).toBeGreaterThanOrEqual(0);
    expect(lease).toMatchObject({ provider: "browserbase", providerSessionId: "bb-session", persistentRef: "context-1", owned: true });
    await lease.close();
    expect(mocks.bbSessionUpdate).toHaveBeenCalledWith("bb-session", { status: "REQUEST_RELEASE" });
  });

  it("disconnects attached Browserbase locally unless terminate=true", async () => {
    const provider = new BrowserbaseProvider(await tempConfig());
    const attached = await provider.open({ profile: "p", headless: true, providerSessionId: "bb-attached", attach: true });
    await attached.close();
    expect(mocks.bbSessionUpdate).not.toHaveBeenCalled();
    const terminate = await provider.open({ profile: "p", headless: true, providerSessionId: "bb-attached", attach: true });
    await terminate.close(true);
    expect(mocks.bbSessionUpdate).toHaveBeenCalledWith("bb-attached", { status: "REQUEST_RELEASE" });
  });

  it("omits Anchor initial_url until interception and applies it after attach", async () => {
    const config = await tempConfig({ hostAllowlist: ["example.com"] });
    const lease = await new AnchorProvider(config).open({
      profile: "p", headless: false, persistentRef: "profile-1", initialUrl: "https://example.com",
      keepAlive: true, timeoutSeconds: 120, attach: false,
    });
    const call = mocks.anchorCreate.mock.calls[0]?.[0];
    expect(call.body.session).toEqual({ timeout: { max_duration: 2, idle_timeout: -1 }, recording: { active: false } });
    expect(call.body.browser).toEqual({ headless: { active: false }, profile: { name: "profile-1", persist: true } });
    expect(mocks.events.indexOf("route")).toBeGreaterThanOrEqual(0);
    expect(mocks.events.indexOf("route")).toBeLessThan(mocks.events.indexOf("goto"));
    expect(mocks.page.goto).toHaveBeenCalledWith("https://example.com", expect.any(Object));
    await lease.close();
    expect(mocks.anchorDelete).toHaveBeenCalledWith(expect.objectContaining({ path: { session_id: "anchor-session" } }));
  });

  it("disconnects attached Anchor locally unless terminate=true", async () => {
    const provider = new AnchorProvider(await tempConfig());
    const attached = await provider.open({ profile: "p", headless: true, providerSessionId: "anchor-attached", attach: true });
    await attached.close();
    expect(mocks.anchorDelete).not.toHaveBeenCalled();
    const terminate = await provider.open({ profile: "p", headless: true, providerSessionId: "anchor-attached", attach: true });
    await terminate.close(true);
    expect(mocks.anchorDelete).toHaveBeenCalledWith(expect.objectContaining({ path: { session_id: "anchor-attached" } }));
  });
});
