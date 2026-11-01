import { describe, expect, it, vi } from "vitest";
import { SharedCdpTransport } from "../../src/shared-cdp.js";

function setup() {
  const transport = new SharedCdpTransport("ws://127.0.0.1:9222/devtools/browser/test");
  const forwarded = vi.fn();
  transport.onmessage = forwarded;
  const sent = vi.spyOn(transport, "send");
  return { transport, forwarded, sent };
}
const attached = (targetId: string, sessionId = targetId, extra = {}) => ({
  method: "Target.attachedToTarget", params: { sessionId, targetInfo: { targetId, type: "page", ...extra }, waitingForDebugger: false },
});

describe("shared Chrome target ownership", () => {
  it("detaches unrelated existing and later targets without initializing or closing their pages", () => {
    const { transport, forwarded, sent } = setup();
    transport.receive(attached("existing"));
    transport.receive(attached("later-user-tab"));
    expect(forwarded).not.toHaveBeenCalled();
    expect(sent.mock.calls.map(([m]) => (m as any).method)).toEqual(["Target.detachFromTarget", "Target.detachFromTarget"]);
  });
  it("resumes only this client's unexpectedly paused session before detaching", () => {
    const { transport, sent } = setup();
    const message = attached("existing"); message.params.waitingForDebugger = true;
    transport.receive(message);
    expect(sent.mock.calls[0][0]).toMatchObject({ method: "Runtime.runIfWaitingForDebugger", sessionId: "existing" });
    expect(sent.mock.calls[1][0]).toMatchObject({ method: "Target.detachFromTarget", params: { sessionId: "existing" } });
  });
  it("handles attachment-before-create-response without adopting a simultaneous unrelated tab", () => {
    const { transport, forwarded, sent } = setup();
    transport.send({ id: 1, method: "Target.createTarget", params: { url: "about:blank" } });
    transport.receive(attached("ours")); transport.receive(attached("user-tab"));
    expect(forwarded).not.toHaveBeenCalled();
    transport.receive({ id: 1, result: { targetId: "ours" } });
    expect(forwarded.mock.calls.map(([m]) => m.params?.targetInfo?.targetId ?? m.id)).toEqual(["ours", 1]);
    expect(sent).toHaveBeenCalledWith(expect.objectContaining({ method: "Target.detachFromTarget", params: { sessionId: "user-tab" } }));
  });
  it("accepts owned target children and popups but drops unrelated session messages", () => {
    const { transport, forwarded } = setup();
    transport.send({ id: 1, method: "Target.createTarget" });
    transport.receive({ id: 1, result: { targetId: "ours" } });
    transport.receive(attached("ours", "our-session"));
    transport.receive(attached("popup", "popup-session", { openerId: "ours" }));
    transport.receive({ ...attached("frame", "frame-session"), sessionId: "our-session" });
    transport.receive({ method: "Runtime.executionContextCreated", sessionId: "unrelated" });
    expect(forwarded.mock.calls).toHaveLength(4);
  });
  it("clears buffered targets on a failed create and never exposes internal reply ids", () => {
    const { transport, forwarded, sent } = setup();
    transport.send({ id: 1, method: "Target.createTarget" }); transport.receive(attached("user-tab"));
    transport.receive({ id: 1 }); transport.receive({ id: -1, result: {} });
    expect(sent).toHaveBeenCalledWith(expect.objectContaining({ method: "Target.detachFromTarget" }));
    expect(forwarded.mock.calls).toHaveLength(1);
  });
});
