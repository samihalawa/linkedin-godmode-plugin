import type { BrowserNetworkInput } from "./schemas.js";
import type { SessionManager } from "./sessions.js";
export declare class NetworkCapture {
    private readonly sessions;
    private readonly captures;
    constructor(sessions: SessionManager);
    private key;
    execute(input: BrowserNetworkInput): Promise<unknown>;
    private clearState;
    private createState;
    private storeStreamChunk;
    private finishStream;
    private installCdp;
    private drain;
    private stopKey;
    stopAll(): Promise<void>;
}
