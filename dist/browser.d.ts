import type { Locator, Page } from "playwright";
import type { z } from "zod";
import type { RuntimeConfig } from "./config.js";
import type { BrowserActInput, BrowserCaptureInput, BrowserEvaluateInput, BrowserNavigateInput } from "./schemas.js";
import { LocatorSchema } from "./schemas.js";
import type { SessionManager } from "./sessions.js";
export type LocatorInput = z.infer<typeof LocatorSchema>;
export declare function resolveLocator(page: Page, target: LocatorInput): Locator;
export declare class BrowserOperations {
    private readonly sessions;
    private readonly config;
    constructor(sessions: SessionManager, config: RuntimeConfig);
    private assertContext;
    private snapshot;
    private assertOrRecover;
    navigate(input: BrowserNavigateInput): Promise<unknown>;
    act(input: BrowserActInput): Promise<unknown>;
    evaluate(input: BrowserEvaluateInput): Promise<unknown>;
    capture(input: BrowserCaptureInput): Promise<unknown>;
}
