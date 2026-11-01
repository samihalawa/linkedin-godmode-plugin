import type { Page } from "playwright";
import type { RuntimeConfig } from "./config.js";
import { type ProviderLease } from "./providers.js";
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
export declare class SessionManager {
    readonly config: RuntimeConfig;
    private readonly sessions;
    private readonly providers;
    constructor(config: RuntimeConfig);
    execute(input: BrowserSessionInput): Promise<unknown>;
    private resolveAlias;
    private open;
    get(sessionId?: string): ManagedSession;
    getPage(sessionId?: string, pageId?: string, allowPolicyRecovery?: boolean): Page;
    pageId(session: ManagedSession, page: Page): string;
    private registerPage;
    private synchronizePages;
    private describe;
    private describePage;
    close(sessionId: string, terminate?: boolean): Promise<void>;
    closeAll(): Promise<void>;
}
