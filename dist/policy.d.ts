import type { BrowserContext, Page } from "playwright";
import type { RuntimeConfig } from "./config.js";
/** Borrowed contexts never include unrelated existing or independently opened tabs. */
export declare function borrowContext(context: BrowserContext): Set<Page>;
export declare function managedPages(context: BrowserContext): Page[];
export declare function trackManagedPage(context: BrowserContext, page: Page): void;
export declare function assertUrlAllowed(rawUrl: string, config: RuntimeConfig): URL;
export declare function isPageUrlAllowed(rawUrl: string, config: RuntimeConfig): boolean;
/** Install before any provider initial navigation. It covers redirects, history,
 * reloads, form/link/JS navigation, and popup/new-page main-frame requests. */
export declare function installNavigationPolicy(context: BrowserContext, config: RuntimeConfig): Promise<void>;
export declare function settleContextPolicy(page: Page, config: RuntimeConfig): Promise<void>;
export declare function assertPagePolicy(page: Page, config: RuntimeConfig): void;
export declare function clearContextPolicyViolations(context: BrowserContext): void;
export declare function assertContextPolicy(context: BrowserContext, config: RuntimeConfig): void;
export declare function browserbaseAllowedDomains(config: RuntimeConfig): string[] | undefined;
export declare function assertHttpMethodAllowed(method: string, config: RuntimeConfig): void;
export declare function assertBrowserActionAllowed(action: string, config: RuntimeConfig): void;
export declare function assertEvaluateAllowed(config: RuntimeConfig): void;
export declare function assertTaskAllowed(config: RuntimeConfig): void;
export declare function boundedJson(value: unknown, maxBytes: number): unknown;
