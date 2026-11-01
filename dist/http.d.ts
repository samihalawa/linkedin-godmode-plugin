import type { RuntimeConfig } from "./config.js";
import type { HttpRequestInput } from "./schemas.js";
import type { SessionManager } from "./sessions.js";
export declare function deriveCsrfToken(cookieValue: string): string;
export declare class HttpOperations {
    private readonly sessions;
    private readonly config;
    constructor(sessions: SessionManager, config: RuntimeConfig);
    request(input: HttpRequestInput): Promise<unknown>;
    private nativeTokenRequest;
    private nodeFetch;
    private formatResponse;
}
export declare function assertNoCookieHeader(headers: Record<string, string> | undefined): void;
