import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { NetworkCapture } from "../../src/network.js";

class FakePage extends EventEmitter {
  override on(event: string, listener: (...args: any[]) => void): this { return super.on(event, listener); }
  override off(event: string, listener: (...args: any[]) => void): this { return super.off(event, listener); }
}

class FakeCdp extends EventEmitter {
  send = vi.fn(async () => ({}));
  detach = vi.fn(async () => undefined);
  override on(event: string, listener: (...args: any[]) => void): this { return super.on(event, listener); }
  override off(event: string, listener: (...args: any[]) => void): this { return super.off(event, listener); }
}

function setup() {
  const page = new FakePage();
  const session = { id: "s" };
  const sessions = { get: () => session, getPage: () => page, pageId: () => "page-1" };
  return { page, capture: new NetworkCapture(sessions as never) };
}

function setupCdp() {
  const page = new FakePage() as FakePage & { context(): { newCDPSession(): Promise<FakeCdp> } };
  const cdp = new FakeCdp();
  page.context = () => ({ newCDPSession: async () => cdp });
  const session = { id: "s" };
  const sessions = { get: () => session, getPage: () => page, pageId: () => "page-1" };
  const capture = new NetworkCapture(sessions as never);
  const state = () => [...((capture as any).captures.values() as Iterable<any>)][0];
  return { page, cdp, capture, state };
}

function request(id = 1, headers: Record<string, string> = { "content-type": "text/plain", "content-length": "12" }) {
  return {
    method: () => "POST", url: () => `https://example.com/api?token=private-${id}`, resourceType: () => "fetch",
    allHeaders: vi.fn(async () => headers), postDataBuffer: () => Buffer.from("request-body"), failure: () => null,
  };
}

describe("network capture", () => {
  it("captures bounded redacted data and supports aggregate caps, clear, and stop", async () => {
    const { page, capture } = setup();
    await capture.execute({ operation: "start", sessionId: "s", pageId: "page-1", includeBodies: true, maxBodyBytes: 16, maxTotalBytes: 16, maxEntries: 2 });
    const req = request();
    const response = {
      request: () => req, status: () => 201,
      allHeaders: vi.fn(async () => ({ "set-cookie": "secret=1", "content-type": "text/plain", "content-length": "13" })),
      body: vi.fn(async () => Buffer.from("response-body")),
    };
    page.emit("request", req); page.emit("response", response);
    const read = await capture.execute({ operation: "read", sessionId: "s", pageId: "page-1" }) as { records: Array<Record<string, any>> };
    expect(read.records).toHaveLength(1);
    const serialized = JSON.stringify(read);
    expect(serialized).not.toContain("private-1");
    expect(serialized).not.toContain("secret=1");
    expect(read.records[0]?.requestBody?.data).toBe("request-body");
    expect(read.records[0]?.responseBody?.truncated).toBe(true);
    expect(response.body).not.toHaveBeenCalled();
    await capture.execute({ operation: "clear", sessionId: "s", pageId: "page-1" });
    expect((await capture.execute({ operation: "read", sessionId: "s", pageId: "page-1" }) as { records: unknown[] }).records).toEqual([]);
    expect(await capture.execute({ operation: "stop", sessionId: "s", pageId: "page-1" })).toMatchObject({ capturing: false });
  });

  it("does not call Playwright full-body buffering for chunked or oversized bodies", async () => {
    const { page, capture } = setup();
    await capture.execute({ operation: "start", sessionId: "s", includeBodies: true, maxBodyBytes: 1024, maxTotalBytes: 2048 });
    const req = request(2, { "content-type": "text/plain" });
    const body = vi.fn(async () => Buffer.alloc(8_000_000));
    page.emit("request", req);
    page.emit("response", { request: () => req, status: () => 200, allHeaders: async () => ({ "content-type": "text/plain", "transfer-encoding": "chunked" }), body });
    const read = await capture.execute({ operation: "read", sessionId: "s" }) as { records: Array<Record<string, any>> };
    expect(body).not.toHaveBeenCalled();
    expect(read.records[0]?.responseBody).toMatchObject({ truncated: true, data: "" });
  });

  it("caps pending tasks and boundedly cancels cleanup", async () => {
    const { page, capture } = setup();
    await capture.execute({ operation: "start", sessionId: "s", maxPendingTasks: 1 });
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const first = request(1);
    first.allHeaders = vi.fn(async () => { await blocked; return {}; });
    page.emit("request", first);
    for (let index = 2; index <= 5; index += 1) page.emit("request", request(index));
    release();
    const read = await capture.execute({ operation: "read", sessionId: "s" }) as { records: Array<{ error?: string }> };
    expect(read.records.filter((record) => record.error?.includes("pending-task limit")).length).toBeGreaterThanOrEqual(1);

    const req = request(9);
    page.emit("request", req);
    page.emit("response", {
      request: () => req, status: () => 200,
      allHeaders: async () => ({ "content-type": "text/plain", "content-length": "1" }),
      body: async () => new Promise<Buffer>(() => undefined),
    });
    const started = Date.now();
    await capture.execute({ operation: "stop", sessionId: "s" });
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("releases metadata-only CDP request records after terminal events", async () => {
    const { cdp, capture, state } = setupCdp();
    await capture.execute({ operation: "start", sessionId: "s", includeBodies: false });
    cdp.emit("Network.requestWillBeSent", { requestId: "metadata", request: { url: "https://example.com/", method: "GET" } });
    cdp.emit("Network.responseReceived", { requestId: "metadata", response: { url: "https://example.com/", status: 200 } });
    cdp.emit("Network.loadingFinished", { requestId: "metadata" });
    expect(state().byCdpRequest.has("metadata")).toBe(false);
    await capture.execute({ operation: "stop", sessionId: "s" });
  });

  it("releases CDP streams when the pending-task limit skips body setup", async () => {
    const { cdp, capture, state } = setupCdp();
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    cdp.send.mockImplementation(async (method: string) => {
      if (method === "Network.streamResourceContent") await blocked;
      return {};
    });
    await capture.execute({ operation: "start", sessionId: "s", includeBodies: true, maxPendingTasks: 1 });
    for (const requestId of ["held", "limited"]) {
      cdp.emit("Network.requestWillBeSent", { requestId, request: { url: `https://example.com/${requestId}`, method: "GET" } });
      cdp.emit("Network.responseReceived", { requestId, response: { url: `https://example.com/${requestId}`, status: 200 } });
    }
    cdp.emit("Network.loadingFinished", { requestId: "limited" });
    expect(state().byCdpRequest.has("limited")).toBe(false);
    expect(state().streams.has("limited")).toBe(false);
    release();
    await capture.execute({ operation: "stop", sessionId: "s" });
  });

  it("releases CDP streams when scheduled response-body retrieval rejects", async () => {
    const { cdp, capture, state } = setupCdp();
    cdp.send.mockImplementation(async (method: string) => {
      if (method === "Network.getResponseBody") throw new Error("body unavailable");
      return {};
    });
    await capture.execute({ operation: "start", sessionId: "s", includeBodies: true });
    cdp.emit("Network.requestWillBeSent", { requestId: "rejected", request: { url: "https://example.com/rejected", method: "GET" } });
    cdp.emit("Network.responseReceived", {
      requestId: "rejected",
      response: { url: "https://example.com/rejected", status: 200, headers: { "content-type": "text/plain", "content-length": "4" } },
    });
    cdp.emit("Network.loadingFinished", { requestId: "rejected" });
    const read = await capture.execute({ operation: "read", sessionId: "s" }) as { records: Array<{ error?: string }> };
    expect(read.records[0]?.error).toContain("body unavailable");
    expect(state().byCdpRequest.has("rejected")).toBe(false);
    expect(state().streams.has("rejected")).toBe(false);
    await capture.execute({ operation: "stop", sessionId: "s" });
  });
});
