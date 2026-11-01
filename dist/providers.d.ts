import { type Browser, type BrowserContext } from "playwright";
import type { RuntimeConfig } from "./config.js";
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
export declare class LocalProvider implements SessionProvider {
    private readonly config;
    readonly name: "local";
    constructor(config: RuntimeConfig);
    open(options: ProviderOpenOptions): Promise<ProviderLease>;
}
export declare class BrowserbaseProvider implements SessionProvider {
    private readonly config;
    readonly name: "browserbase";
    private client;
    constructor(config: RuntimeConfig);
    open(options: ProviderOpenOptions): Promise<ProviderLease>;
}
export declare class AnchorProvider implements SessionProvider {
    private readonly config;
    readonly name: "anchor";
    private client;
    constructor(config: RuntimeConfig);
    open(options: ProviderOpenOptions): Promise<ProviderLease>;
}
export declare function createProviders(config: RuntimeConfig): Map<ProviderName, SessionProvider>;
