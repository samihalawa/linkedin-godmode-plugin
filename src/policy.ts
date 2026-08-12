import { Buffer } from "node:buffer";
import type { BrowserContext, Page, Route } from "playwright";
import { GodmodeError } from "./errors.js";
import type { RuntimeConfig } from "./config.js";

const SAFE_HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const NON_MUTATING_ACTIONS = new Set(["hover", "focus", "wait"]);
const installedContexts = new WeakSet<BrowserContext>();
const pageViolations = new WeakMap<Page, GodmodeError>();
const contextViolations = new WeakMap<BrowserContext, GodmodeError>();
const contextActivity = new WeakMap<BrowserContext, { pending: number; sequence: number }>();
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function hostnameAllowed(hostname: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true;
  const normalized = hostname.toLowerCase();
  return allowlist.some((entry) => {
    const allowed = entry.trim().toLowerCase();
    if (allowed.startsWith("*.")) {
      const suffix = allowed.slice(1);
      return normalized.endsWith(suffix) && normalized.length > suffix.length;
    }
    return normalized === allowed;
  });
}

export function assertUrlAllowed(rawUrl: string, config: RuntimeConfig): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch (error) {
    throw new GodmodeError("BAD_INPUT", "URL is invalid", undefined, { cause: error });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new GodmodeError("POLICY_DENIED", "Only http and https URLs are allowed");
  }
  if (!hostnameAllowed(url.hostname, config.hostAllowlist)) {
    throw new GodmodeError("POLICY_DENIED", `Host is not in LINKEDIN_GODMODE_HOST_ALLOWLIST: ${url.hostname}`);
  }
  return url;
}

function checkPageUrl(rawUrl: string, config: RuntimeConfig): void {
  if (rawUrl === "about:blank" || rawUrl === "") return;
  assertUrlAllowed(rawUrl, config);
}

export function isPageUrlAllowed(rawUrl: string, config: RuntimeConfig): boolean {
  try { checkPageUrl(rawUrl, config); return true; }
  catch { return false; }
}

async function guardRoute(route: Route, context: BrowserContext, config: RuntimeConfig): Promise<void> {
  const request = route.request();
  let topLevelNavigation = request.isNavigationRequest();
  if (topLevelNavigation) {
    try { topLevelNavigation = request.frame().parentFrame() === null; } catch { topLevelNavigation = true; }
  }
  if (!topLevelNavigation) {
    await route.continue();
    return;
  }
  try {
    assertUrlAllowed(request.url(), config);
    if (config.hostAllowlist.length === 0) {
      await route.continue();
      return;
    }
    // A continued request may follow redirects without another route callback.
    // Fetch one hop, validate Location before exposing it to the page, and then
    // fulfill. Rejecting the first hop keeps an existing page on its last safe URL.
    const response = await route.fetch({ maxRedirects: 0, timeout: config.timeoutMs });
    try {
      const location = response.headers().location;
      if (REDIRECT_STATUSES.has(response.status()) && location) {
        assertUrlAllowed(new URL(location, request.url()).toString(), config);
      }
      await route.fulfill({ response });
    } finally {
      await response.dispose();
    }
  } catch (error) {
    if (error instanceof GodmodeError) {
      contextViolations.set(context, error);
      try { pageViolations.set(request.frame().page(), error); } catch { /* popup frame may not exist yet */ }
    }
    await route.abort("blockedbyclient").catch(() => undefined);
  }
}

/** Install before any provider initial navigation. It covers redirects, history,
 * reloads, form/link/JS navigation, and popup/new-page main-frame requests. */
export async function installNavigationPolicy(context: BrowserContext, config: RuntimeConfig): Promise<void> {
  if (installedContexts.has(context)) return;
  installedContexts.add(context);
  const activity = { pending: 0, sequence: 0 };
  contextActivity.set(context, activity);
  await context.route("**/*", async (route) => {
    activity.pending += 1;
    activity.sequence += 1;
    try { await guardRoute(route, context, config); }
    finally { activity.pending -= 1; }
  });
  const watch = (page: Page) => {
    page.on("framenavigated", (frame) => {
      if (frame !== page.mainFrame()) return;
      try { checkPageUrl(frame.url(), config); }
      catch (error) { pageViolations.set(page, error as GodmodeError); }
    });
  };
  for (const page of context.pages()) watch(page);
  context.on("page", watch);
}

export async function settleContextPolicy(page: Page, config: RuntimeConfig): Promise<void> {
  const activity = contextActivity.get(page.context());
  const deadline = Date.now() + config.timeoutMs;
  await page.waitForTimeout(0);
  while (activity) {
    const sequence = activity.sequence;
    if (activity.pending === 0) {
      await page.waitForTimeout(20);
      if (activity.pending === 0 && activity.sequence === sequence) break;
    } else {
      await page.waitForTimeout(10);
    }
    if (Date.now() >= deadline) throw new GodmodeError("TIMEOUT", `Navigation policy did not settle after ${config.timeoutMs}ms`);
  }
  assertContextPolicy(page.context(), config);
}

export function assertPagePolicy(page: Page, config: RuntimeConfig): void {
  const violation = pageViolations.get(page);
  if (violation) {
    pageViolations.delete(page);
    throw violation;
  }
  checkPageUrl(page.url(), config);
}

export function clearContextPolicyViolations(context: BrowserContext): void {
  contextViolations.delete(context);
  for (const page of context.pages()) pageViolations.delete(page);
}

export function assertContextPolicy(context: BrowserContext, config: RuntimeConfig): void {
  const violation = contextViolations.get(context);
  if (violation) {
    clearContextPolicyViolations(context);
    throw violation;
  }
  for (const page of context.pages()) assertPagePolicy(page, config);
}

export function browserbaseAllowedDomains(config: RuntimeConfig): string[] | undefined {
  if (config.hostAllowlist.length === 0) return undefined;
  return [...new Set(config.hostAllowlist.map((entry) => entry.trim().toLowerCase().replace(/^\*\./, "")).filter(Boolean))];
}

export function assertHttpMethodAllowed(method: string, config: RuntimeConfig): void {
  if (config.readOnly && !SAFE_HTTP_METHODS.has(method.toUpperCase())) {
    throw new GodmodeError("POLICY_DENIED", `${method.toUpperCase()} is blocked by LINKEDIN_GODMODE_READ_ONLY`);
  }
}

export function assertBrowserActionAllowed(action: string, config: RuntimeConfig): void {
  if (config.readOnly && !NON_MUTATING_ACTIONS.has(action)) {
    throw new GodmodeError("POLICY_DENIED", `${action} is blocked by LINKEDIN_GODMODE_READ_ONLY`);
  }
}

export function assertEvaluateAllowed(config: RuntimeConfig): void {
  if (config.readOnly) throw new GodmodeError("POLICY_DENIED", "JavaScript evaluation is blocked by LINKEDIN_GODMODE_READ_ONLY");
}

export function assertTaskAllowed(config: RuntimeConfig): void {
  if (config.readOnly) throw new GodmodeError("POLICY_DENIED", "Provider browser tasks are blocked by LINKEDIN_GODMODE_READ_ONLY");
}

export function boundedJson(value: unknown, maxBytes: number): unknown {
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized) > maxBytes) {
    throw new GodmodeError("OUTPUT_TOO_LARGE", `Output exceeds ${maxBytes} bytes`);
  }
  return value;
}
