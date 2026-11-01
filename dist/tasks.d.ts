import type { RuntimeConfig } from "./config.js";
import type { BrowserTaskInput } from "./schemas.js";
import type { SessionManager } from "./sessions.js";
export declare class BrowserTasks {
    private readonly sessions;
    private readonly config;
    constructor(sessions: SessionManager, config: RuntimeConfig);
    execute(input: BrowserTaskInput): Promise<unknown>;
    private browserbaseClient;
    private anchorClient;
    private runBrowserbase;
    private runAnchor;
    private status;
}
