import WebSocket from "ws";
import { chromium } from "playwright";
/** A private CDP client in the existing browser. Only targets created by this
 * client (and their children/popups) reach Playwright's page initialization. */
export class SharedCdpTransport {
    endpoint;
    onmessage;
    onclose;
    socket;
    nextInternalId = -1;
    ownedTargets = new Set();
    ownedSessions = new Set();
    creates = new Set();
    pendingAttachments = [];
    constructor(endpoint) {
        this.endpoint = endpoint;
    }
    open() {
        const socket = this.socket = new WebSocket(this.endpoint);
        socket.on("message", (data) => this.receive(JSON.parse(data.toString())));
        socket.on("close", () => this.onclose?.());
        socket.on("error", (error) => this.onclose?.(error.message));
    }
    send(value) {
        const message = value;
        if (message.method === "Target.createTarget" && message.id !== undefined)
            this.creates.add(message.id);
        // Never pause unrelated targets while filtering the browser-wide sweep.
        if (message.method === "Target.setAutoAttach" && !message.sessionId) {
            message.params = { ...message.params, waitForDebuggerOnStart: false };
        }
        const send = () => this.socket?.send(JSON.stringify(message));
        if (this.socket?.readyState === WebSocket.OPEN)
            send();
        else
            this.socket?.once("open", send);
    }
    detach(message) {
        const sessionId = message.params?.sessionId;
        if (message.params?.waitingForDebugger) {
            this.send({ id: this.nextInternalId--, method: "Runtime.runIfWaitingForDebugger", sessionId });
        }
        this.send({ id: this.nextInternalId--, method: "Target.detachFromTarget", params: { sessionId } });
    }
    acceptAttachment(message) {
        const info = message.params?.targetInfo;
        return this.ownedTargets.has(info?.targetId) || this.ownedTargets.has(info?.openerId)
            || (message.sessionId !== undefined && this.ownedSessions.has(message.sessionId));
    }
    forwardAttachment(message) {
        this.ownedTargets.add(message.params.targetInfo.targetId);
        this.ownedSessions.add(message.params.sessionId);
        this.onmessage?.(message);
    }
    receive(message) {
        if (message.id !== undefined && message.id < 0)
            return;
        if (message.id !== undefined && this.creates.delete(message.id)) {
            if (message.result?.targetId)
                this.ownedTargets.add(message.result.targetId);
            const pending = this.pendingAttachments;
            this.pendingAttachments = [];
            for (const attachment of pending) {
                if (this.acceptAttachment(attachment))
                    this.forwardAttachment(attachment);
                else if (this.creates.size)
                    this.pendingAttachments.push(attachment);
                else
                    this.detach(attachment);
            }
        }
        if (message.method === "Target.attachedToTarget") {
            if (this.acceptAttachment(message))
                this.forwardAttachment(message);
            else if (this.creates.size)
                this.pendingAttachments.push(message);
            else
                this.detach(message);
            return;
        }
        if (message.sessionId && !this.ownedSessions.has(message.sessionId))
            return;
        this.onmessage?.(message);
    }
    close() { this.socket?.close(); }
}
export async function connectSharedChrome(url, timeout) {
    const response = await fetch(new URL("json/version", `${url.replace(/\/$/, "")}/`), { signal: AbortSignal.timeout(timeout) });
    if (!response.ok)
        throw new Error(`Chrome CDP discovery returned HTTP ${response.status}`);
    const { webSocketDebuggerUrl } = await response.json();
    if (!webSocketDebuggerUrl)
        throw new Error("Chrome CDP discovery returned no browser websocket");
    const endpoint = new URL(webSocketDebuggerUrl);
    const expected = new URL(url);
    if (endpoint.protocol !== "ws:" || endpoint.hostname !== expected.hostname || endpoint.port !== expected.port) {
        throw new Error("Chrome CDP websocket must use the configured loopback host and port");
    }
    const transport = new SharedCdpTransport(endpoint.toString());
    transport.open();
    try {
        return await chromium.connectOverCDP(transport, { timeout, noDefaults: true });
    }
    catch (error) {
        transport.close();
        throw error;
    }
}
