import { chromium, type Browser, type BrowserContext } from "playwright";
import Browserbase from "@browserbasehq/sdk";
import {
  Sessions,
  connectBrowser,
  createAnchorbrowserClient,
  type Client as AnchorClient,
  type SessionCreateRequestSchema,
} from "anchorbrowser";
import { join } from "node:path";
import type { RuntimeConfig } from "./config.js";
import { ensurePrivateDirectory, getProviderSecret } from "./config.js";
import { GodmodeError, invariant } from "./errors.js";
import { assertContextPolicy, assertPagePolicy, assertUrlAllowed, browserbaseAllowedDomains, installNavigationPolicy } from "./policy.js";
import type { ProviderName } from "./schemas.js";

export interface ProviderOpenOptions {
  profile: string;
  headless: boolean;
  providerSessionId?: string;
  persistentRef?: string;
  initialUrl?: string;
  keepAlive?: boolean;
  timeoutSeconds?: number;
  attach: boolean;
}

export interface ProviderLease {
  provider: ProviderName;
  browser?: Browser;
  context: BrowserContext;
  providerSessionId?: string;
  persistentRef?: string;
  owned: boolean;
  close(terminate?: boolean): Promise<void>;
}

export interface SessionProvider {
  readonly name: ProviderName;
  open(options: ProviderOpenOptions): Promise<ProviderLease>;
}

async function navigateInitial(context: BrowserContext, rawUrl: string | undefined, config: RuntimeConfig): Promise<void> {
  assertContextPolicy(context, config);
  if (!rawUrl) return;
  assertUrlAllowed(rawUrl, config);
  const page = context.pages()[0] ?? await context.newPage();
  try {
    await page.goto(rawUrl, { waitUntil: "domcontentloaded", timeout: config.timeoutMs });
  } catch (error) {
    assertContextPolicy(context, config);
    throw error;
  }
  assertPagePolicy(page, config);
  assertContextPolicy(context, config);
}

export class LocalProvider implements SessionProvider {
  readonly name = "local" as const;
  constructor(private readonly config: RuntimeConfig) {}

  async open(options: ProviderOpenOptions): Promise<ProviderLease> {
    if (!/^[A-Za-z0-9._-]+$/.test(options.profile)) {
      throw new GodmodeError("BAD_INPUT", "Local profile names may contain only letters, digits, dot, underscore, and hyphen");
    }
    const userDataDir = join(this.config.profileDir, options.profile);
    await ensurePrivateDirectory(userDataDir);
    let context: BrowserContext;
    try {
      const channel = process.env.LINKEDIN_GODMODE_CHROME_CHANNEL;
      context = await chromium.launchPersistentContext(userDataDir, {
        headless: options.headless,
        ...(channel ? { channel } : {}),
        viewport: null,
      });
      await installNavigationPolicy(context, this.config);
      await navigateInitial(context, options.initialUrl, this.config);
    } catch (error) {
      await context!.close().catch(() => undefined);
      if (error instanceof GodmodeError) throw error;
      throw new GodmodeError("PROVIDER_ERROR", "Unable to launch the dedicated local Chrome profile", undefined, { cause: error });
    }
    return {
      provider: this.name,
      context,
      owned: true,
      persistentRef: options.profile,
      close: async () => context.close(),
    };
  }
}

export class BrowserbaseProvider implements SessionProvider {
  readonly name = "browserbase" as const;
  private client(): Browserbase {
    const options: ConstructorParameters<typeof Browserbase>[0] = {
      apiKey: getProviderSecret("browserbase"),
      maxRetries: 0,
      timeout: this.config.timeoutMs,
    };
    if (this.config.browserbase.baseUrl) options.baseURL = this.config.browserbase.baseUrl;
    return new Browserbase(options);
  }

  constructor(private readonly config: RuntimeConfig) {}

  async open(options: ProviderOpenOptions): Promise<ProviderLease> {
    const client = this.client();
    const owned = !options.attach;
    let providerSessionId: string;
    let connectUrl: string | undefined;
    let persistentRef = options.persistentRef;
    if (options.attach) {
      invariant(options.providerSessionId, "BAD_INPUT", "providerSessionId is required to attach a Browserbase session");
      const session = await client.sessions.retrieve(options.providerSessionId);
      providerSessionId = session.id;
      connectUrl = session.connectUrl;
      persistentRef = session.contextId ?? persistentRef;
    } else {
      if (options.keepAlive && !persistentRef) {
        const context = await client.contexts.create(this.config.browserbase.projectId ? { projectId: this.config.browserbase.projectId } : undefined);
        persistentRef = context.id;
      }
      const allowedDomains = browserbaseAllowedDomains(this.config);
      const browserSettings = persistentRef || allowedDomains
        ? {
            ...(persistentRef ? { context: { id: persistentRef, persist: true } } : {}),
            ...(allowedDomains ? { allowedDomains } : {}),
          }
        : undefined;
      const session = await client.sessions.create({
        ...(this.config.browserbase.projectId ? { projectId: this.config.browserbase.projectId } : {}),
        ...(this.config.browserbase.region ? { region: this.config.browserbase.region } : {}),
        ...(options.timeoutSeconds ? { timeout: options.timeoutSeconds } : {}),
        keepAlive: options.keepAlive ?? false,
        ...(browserSettings ? { browserSettings } : {}),
      });
      providerSessionId = session.id;
      connectUrl = session.connectUrl;
      persistentRef = session.contextId ?? persistentRef;
    }
    invariant(connectUrl, "PROVIDER_ERROR", "Browserbase did not return a CDP connection URL");
    let browser: Browser | undefined;
    try {
      browser = await chromium.connectOverCDP(connectUrl, { timeout: this.config.timeoutMs });
      const context = browser.contexts()[0];
      invariant(context, "PROVIDER_ERROR", "Browserbase CDP connection returned no browser context");
      await installNavigationPolicy(context, this.config);
      await navigateInitial(context, options.initialUrl, this.config);
      return {
        provider: this.name,
        browser,
        context,
        providerSessionId,
        owned,
        ...(persistentRef ? { persistentRef } : {}),
        close: async (terminate = false) => {
          await browser?.close().catch(() => undefined);
          if (owned || terminate) await client.sessions.update(providerSessionId, { status: "REQUEST_RELEASE" }).catch(() => undefined);
        },
      };
    } catch (error) {
      await browser?.close().catch(() => undefined);
      if (owned) await client.sessions.update(providerSessionId, { status: "REQUEST_RELEASE" }).catch(() => undefined);
      if (error instanceof GodmodeError) throw error;
      throw new GodmodeError("PROVIDER_ERROR", "Unable to attach to the Browserbase session", undefined, { cause: error });
    }
  }
}

export class AnchorProvider implements SessionProvider {
  readonly name = "anchor" as const;
  private client(): AnchorClient {
    return createAnchorbrowserClient({
      baseUrl: this.config.anchor.baseUrl ?? "https://api.anchorbrowser.io",
      auth: getProviderSecret("anchor"),
    });
  }

  constructor(private readonly config: RuntimeConfig) {}

  async open(options: ProviderOpenOptions): Promise<ProviderLease> {
    const client = this.client();
    const owned = !options.attach;
    let browser: Browser | undefined;
    let providerSessionId: string;
    const persistentRef = options.persistentRef;
    try {
      if (options.attach) {
        invariant(options.providerSessionId, "BAD_INPUT", "providerSessionId is required to attach an Anchor session");
        providerSessionId = options.providerSessionId;
        browser = await connectBrowser(providerSessionId, client);
      } else {
        // initial_url is intentionally omitted: policy interception must exist before navigation.
        const body: SessionCreateRequestSchema = {
          session: {
            timeout: {
              ...(options.timeoutSeconds ? { max_duration: Math.max(1, Math.ceil(options.timeoutSeconds / 60)) } : {}),
              idle_timeout: options.keepAlive ? -1 : 5,
            },
            recording: { active: false },
          },
          browser: {
            headless: { active: options.headless },
            ...(persistentRef ? { profile: { name: persistentRef, persist: true } } : {}),
          },
        };
        const session = await Sessions.createSession({ body, client });
        providerSessionId = session.data?.id ?? "";
        invariant(providerSessionId, "PROVIDER_ERROR", "Anchor did not return a session ID");
        browser = session.data?.cdp_url
          ? await chromium.connectOverCDP(session.data.cdp_url, { timeout: this.config.timeoutMs })
          : await connectBrowser(providerSessionId, client);
      }
      const context = browser.contexts()[0];
      invariant(context, "PROVIDER_ERROR", "Anchor CDP connection returned no browser context");
      await installNavigationPolicy(context, this.config);
      await navigateInitial(context, options.initialUrl, this.config);
      return {
        provider: this.name,
        browser,
        context,
        providerSessionId,
        owned,
        ...(persistentRef ? { persistentRef } : {}),
        close: async (terminate = false) => {
          await browser?.close().catch(() => undefined);
          if (owned || terminate) await Sessions.deleteSession({ path: { session_id: providerSessionId }, client }).catch(() => undefined);
        },
      };
    } catch (error) {
      await browser?.close().catch(() => undefined);
      if (owned && providerSessionId!) await Sessions.deleteSession({ path: { session_id: providerSessionId }, client }).catch(() => undefined);
      if (error instanceof GodmodeError) throw error;
      throw new GodmodeError("PROVIDER_ERROR", "Unable to attach to the Anchor session", undefined, { cause: error });
    }
  }
}

export function createProviders(config: RuntimeConfig): Map<ProviderName, SessionProvider> {
  return new Map<ProviderName, SessionProvider>([
    ["local", new LocalProvider(config)],
    ["browserbase", new BrowserbaseProvider(config)],
    ["anchor", new AnchorProvider(config)],
  ]);
}
