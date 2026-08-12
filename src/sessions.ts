import { randomUUID } from "node:crypto";
import type { Page } from "playwright";
import type { RuntimeConfig } from "./config.js";
import { GodmodeError, invariant } from "./errors.js";
import { assertContextPolicy, assertPagePolicy, assertUrlAllowed } from "./policy.js";
import { createProviders, type ProviderLease, type SessionProvider } from "./providers.js";
import type { BrowserSessionInput, ProviderName } from "./schemas.js";

export interface ManagedSession {
  id: string;
  provider: ProviderName;
  profile: string;
  providerSessionId?: string;
  persistentRef?: string;
  createdAt: string;
  lease: ProviderLease;
  pages: Map<string, Page>;
  pageSequence: number;
}

export class SessionManager {
  private readonly sessions = new Map<string, ManagedSession>();
  private readonly providers: Map<ProviderName, SessionProvider>;

  constructor(readonly config: RuntimeConfig) {
    this.providers = createProviders(config);
  }

  async execute(input: BrowserSessionInput): Promise<unknown> {
    switch (input.operation) {
      case "create":
      case "attach":
        return this.open(input);
      case "list":
        return Promise.all([...this.sessions.values()].map((session) => this.describe(session)));
      case "status":
        return this.describe(this.get(input.sessionId));
      case "close": {
        const session = this.get(input.sessionId);
        await this.close(session.id, input.terminate ?? false);
        return { sessionId: session.id, closed: true, remoteTerminated: session.lease.owned || (input.terminate ?? false) };
      }
      case "page_create": {
        const session = this.get(input.sessionId);
        assertContextPolicy(session.lease.context, this.config);
        if (input.url) assertUrlAllowed(input.url, this.config);
        const page = await session.lease.context.newPage();
        const pageId = this.registerPage(session, page);
        try {
          if (input.url) await page.goto(input.url, { timeout: this.config.timeoutMs, waitUntil: "domcontentloaded" });
          assertContextPolicy(session.lease.context, this.config);
          return this.describePage(pageId, page);
        } catch (error) {
          try { assertContextPolicy(session.lease.context, this.config); }
          catch (policyError) { await page.close().catch(() => undefined); throw policyError; }
          await page.close().catch(() => undefined);
          throw error;
        }
      }
      case "page_list": {
        const session = this.get(input.sessionId);
        this.synchronizePages(session);
        return Promise.all([...session.pages].map(([pageId, page]) => this.describePage(pageId, page)));
      }
      case "page_close": {
        const session = this.get(input.sessionId);
        const page = this.getPage(session.id, input.pageId);
        await page.close();
        if (input.pageId) session.pages.delete(input.pageId);
        return { pageId: input.pageId, closed: true };
      }
    }
  }

  private resolveAlias(input: BrowserSessionInput): {
    provider: ProviderName;
    profile: string;
    providerSessionId?: string;
    persistentRef?: string;
  } {
    const configured = input.sessionId ? this.config.aliases.sessions?.[input.sessionId] : undefined;
    const provider = input.provider ?? configured?.provider ?? this.config.defaultProvider;
    const profile = input.profile ?? configured?.profile ?? input.sessionId ?? `${provider}-default`;
    let persistentRef = input.persistentRef ?? configured?.persistentRef;
    if (!persistentRef && input.profile) {
      persistentRef = provider === "browserbase"
        ? this.config.aliases.browserbaseContexts?.[input.profile]
        : provider === "anchor"
          ? this.config.aliases.anchorProfiles?.[input.profile] ?? input.profile
          : input.profile;
    }
    const output: { provider: ProviderName; profile: string; providerSessionId?: string; persistentRef?: string } = { provider, profile };
    const providerSessionId = input.providerSessionId ?? configured?.providerSessionId;
    if (providerSessionId) output.providerSessionId = providerSessionId;
    if (persistentRef) output.persistentRef = persistentRef;
    return output;
  }

  private async open(input: BrowserSessionInput): Promise<unknown> {
    if (input.operation !== "create" && input.operation !== "attach") throw new GodmodeError("BAD_INPUT", "create or attach operation required");
    if (input.initialUrl) assertUrlAllowed(input.initialUrl, this.config);
    const sessionId = input.sessionId ?? randomUUID();
    if (this.sessions.has(sessionId)) throw new GodmodeError("ALREADY_EXISTS", `Session already exists: ${sessionId}`);
    const resolved = this.resolveAlias(input);
    const provider = this.providers.get(resolved.provider);
    invariant(provider, "BAD_INPUT", `Unknown provider: ${resolved.provider}`);
    const lease = await provider.open({
      profile: resolved.profile,
      headless: input.headless ?? this.config.headless,
      ...(resolved.providerSessionId ? { providerSessionId: resolved.providerSessionId } : {}),
      ...(resolved.persistentRef ? { persistentRef: resolved.persistentRef } : {}),
      ...(input.operation === "create" && input.initialUrl ? { initialUrl: input.initialUrl } : {}),
      ...(input.operation === "create" && input.keepAlive !== undefined ? { keepAlive: input.keepAlive } : {}),
      ...(input.operation === "create" && input.timeoutSeconds ? { timeoutSeconds: input.timeoutSeconds } : {}),
      attach: input.operation === "attach",
    });
    const session: ManagedSession = {
      id: sessionId,
      provider: resolved.provider,
      profile: resolved.profile,
      createdAt: new Date().toISOString(),
      lease,
      pages: new Map(),
      pageSequence: 0,
      ...(lease.providerSessionId ? { providerSessionId: lease.providerSessionId } : {}),
      ...(lease.persistentRef ? { persistentRef: lease.persistentRef } : {}),
    };
    this.sessions.set(sessionId, session);
    this.synchronizePages(session);
    if (session.pages.size === 0) this.registerPage(session, await lease.context.newPage());
    assertContextPolicy(session.lease.context, this.config);
    return this.describe(session);
  }

  get(sessionId?: string): ManagedSession {
    const selected = sessionId ?? this.config.defaultSession ?? (this.sessions.size === 1 ? this.sessions.keys().next().value as string | undefined : undefined);
    if (!selected) throw new GodmodeError("BAD_INPUT", "sessionId is required when no unique/default session exists");
    const session = this.sessions.get(selected);
    if (!session) throw new GodmodeError("NOT_FOUND", `Session not found: ${selected}`);
    return session;
  }

  getPage(sessionId?: string, pageId?: string, allowPolicyRecovery = false): Page {
    const session = this.get(sessionId);
    this.synchronizePages(session);
    const selected = pageId ?? (session.pages.size === 1 ? session.pages.keys().next().value as string | undefined : undefined);
    if (!selected) throw new GodmodeError("BAD_INPUT", "pageId is required when the session has multiple pages");
    const page = session.pages.get(selected);
    if (!page || page.isClosed()) throw new GodmodeError("NOT_FOUND", `Page not found: ${selected}`);
    if (!allowPolicyRecovery) assertPagePolicy(page, this.config);
    return page;
  }

  pageId(session: ManagedSession, page: Page): string {
    for (const [id, candidate] of session.pages) if (candidate === page) return id;
    return this.registerPage(session, page);
  }

  private registerPage(session: ManagedSession, page: Page): string {
    for (const [id, candidate] of session.pages) if (candidate === page) return id;
    const pageId = `page-${++session.pageSequence}`;
    session.pages.set(pageId, page);
    page.once("close", () => session.pages.delete(pageId));
    return pageId;
  }

  private synchronizePages(session: ManagedSession): void {
    for (const page of session.lease.context.pages()) this.registerPage(session, page);
    for (const [id, page] of session.pages) if (page.isClosed()) session.pages.delete(id);
  }

  private async describe(session: ManagedSession): Promise<unknown> {
    this.synchronizePages(session);
    return {
      sessionId: session.id,
      provider: session.provider,
      profile: session.profile,
      providerSessionId: session.providerSessionId,
      persistentRef: session.persistentRef,
      ownership: session.lease.owned ? "runtime" : "attached",
      state: "active",
      createdAt: session.createdAt,
      pages: await Promise.all([...session.pages].map(([id, page]) => this.describePage(id, page))),
    };
  }

  private async describePage(pageId: string, page: Page): Promise<unknown> {
    assertPagePolicy(page, this.config);
    return { pageId, url: page.url(), title: await page.title().catch(() => ""), closed: page.isClosed() };
  }

  async close(sessionId: string, terminate = false): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.sessions.delete(sessionId);
    await session.lease.close(terminate);
  }

  async closeAll(): Promise<void> {
    await Promise.allSettled([...this.sessions.keys()].map((id) => this.close(id)));
  }
}
