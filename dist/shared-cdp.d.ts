import { type Browser, type ConnectOverCDPTransport } from "playwright";
type Message = {
    id?: number;
    method?: string;
    sessionId?: string;
    params?: Record<string, any>;
    result?: Record<string, any>;
};
/** A private CDP client in the existing browser. Only targets created by this
 * client (and their children/popups) reach Playwright's page initialization. */
export declare class SharedCdpTransport implements ConnectOverCDPTransport {
    private readonly endpoint;
    onmessage?: (message: object) => void;
    onclose?: (reason?: string) => void;
    private socket?;
    private nextInternalId;
    private readonly ownedTargets;
    private readonly ownedSessions;
    private readonly creates;
    private pendingAttachments;
    constructor(endpoint: string);
    open(): void;
    send(value: object): void;
    private detach;
    private acceptAttachment;
    private forwardAttachment;
    receive(message: Message): void;
    close(): void;
}
export declare function connectSharedChrome(url: string, timeout: number): Promise<Browser>;
export {};
