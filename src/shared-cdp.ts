import WebSocket from "ws";
import { chromium, type Browser, type ConnectOverCDPTransport } from "playwright";

type Message = { id?: number; method?: string; sessionId?: string; params?: Record<string, any>; result?: Record<string, any> };

/** A private CDP client in the existing browser. Only targets created by this
 * client (and their children/popups) reach Playwright's page initialization. */
export class SharedCdpTransport implements ConnectOverCDPTransport {
  onmessage?: (message: object) => void;
  onclose?: (reason?: string) => void;
  private socket?: WebSocket;
  private nextInternalId = -1;
  private readonly ownedTargets = new Set<string>();
  private readonly ownedSessions = new Set<string>();
  private readonly creates = new Set<number>();
  private pendingAttachments: Message[] = [];

  constructor(private readonly endpoint: string) {}

  open(): void {
    const socket = this.socket = new WebSocket(this.endpoint);
    socket.on("message", (data) => this.receive(JSON.parse(data.toString()) as Message));
    socket.on("close", () => this.onclose?.());
    socket.on("error", (error) => this.onclose?.(error.message));
  }

  send(value: object): void {
    const message = value as Message;
    if (message.method === "Target.createTarget" && message.id !== undefined) this.creates.add(message.id);
    // Never pause unrelated targets while filtering the browser-wide sweep.
    if (message.method === "Target.setAutoAttach" && !message.sessionId) {
      message.params = { ...message.params, waitForDebuggerOnStart: false };
    }
    const send = () => this.socket?.send(JSON.stringify(message));
    if (this.socket?.readyState === WebSocket.OPEN) send();
    else this.socket?.once("open", send);
  }

  private detach(message: Message): void {
    const sessionId = message.params?.sessionId as string;
    if (message.params?.waitingForDebugger) {
      this.send({ id: this.nextInternalId--, method: "Runtime.runIfWaitingForDebugger", sessionId });
    }
    this.send({ id: this.nextInternalId--, method: "Target.detachFromTarget", params: { sessionId } });
  }

  private acceptAttachment(message: Message): boolean {
    const info = message.params?.targetInfo;
    return this.ownedTargets.has(info?.targetId) || this.ownedTargets.has(info?.openerId)
      || (message.sessionId !== undefined && this.ownedSessions.has(message.sessionId));
  }

  private forwardAttachment(message: Message): void {
    this.ownedTargets.add(message.params!.targetInfo.targetId);
    this.ownedSessions.add(message.params!.sessionId);
    this.onmessage?.(message);
  }

  receive(message: Message): void {
    if (message.id !== undefined && message.id < 0) return;
    if (message.id !== undefined && this.creates.delete(message.id)) {
      if (message.result?.targetId) this.ownedTargets.add(message.result.targetId);
      const pending = this.pendingAttachments;
      this.pendingAttachments = [];
      for (const attachment of pending) {
        if (this.acceptAttachment(attachment)) this.forwardAttachment(attachment);
        else if (this.creates.size) this.pendingAttachments.push(attachment);
        else this.detach(attachment);
      }
    }
    if (message.method === "Target.attachedToTarget") {
      if (this.acceptAttachment(message)) this.forwardAttachment(message);
      else if (this.creates.size) this.pendingAttachments.push(message);
      else this.detach(message);
      return;
    }
    if (message.sessionId && !this.ownedSessions.has(message.sessionId)) return;
    this.onmessage?.(message);
  }

  close(): void { this.socket?.close(); }
}

export async function connectSharedChrome(url: string, timeout: number): Promise<Browser> {
  const response = await fetch(new URL("json/version", `${url.replace(/\/$/, "")}/`), { signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`Chrome CDP discovery returned HTTP ${response.status}`);
  const { webSocketDebuggerUrl } = await response.json() as { webSocketDebuggerUrl?: string };
  if (!webSocketDebuggerUrl) throw new Error("Chrome CDP discovery returned no browser websocket");
  const endpoint = new URL(webSocketDebuggerUrl);
  const expected = new URL(url);
  if (endpoint.protocol !== "ws:" || endpoint.hostname !== expected.hostname || endpoint.port !== expected.port) {
    throw new Error("Chrome CDP websocket must use the configured loopback host and port");
  }
  const transport = new SharedCdpTransport(endpoint.toString());
  transport.open();
  try { return await chromium.connectOverCDP(transport, { timeout, noDefaults: true }); }
  catch (error) { transport.close(); throw error; }
}
