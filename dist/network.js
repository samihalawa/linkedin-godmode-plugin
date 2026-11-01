import { redact, redactString, safeHeaders } from "./redaction.js";
const MAX_URL_BYTES = 16_384;
const MAX_HEADERS_BYTES = 65_536;
const DRAIN_TIMEOUT_MS = 1_000;
function boundedText(value, maxBytes) {
    const buffer = Buffer.from(value);
    return redactString(buffer.byteLength <= maxBytes ? value : `${buffer.subarray(0, maxBytes).toString("utf8")}[TRUNCATED]`);
}
function stringHeaders(headers) {
    const output = {};
    for (const [key, value] of Object.entries(headers ?? {}))
        output[key.toLowerCase()] = String(value);
    return output;
}
function boundedHeaders(headers) {
    const safe = safeHeaders(headers);
    const output = {};
    let used = 0;
    for (const [key, value] of Object.entries(safe)) {
        const bytes = Buffer.byteLength(key) + Buffer.byteLength(value);
        if (used + bytes > MAX_HEADERS_BYTES)
            break;
        output[key] = value;
        used += bytes;
    }
    return output;
}
function encodeBody(buffer, contentType, truncated = false) {
    const text = /(?:json|text|javascript|xml|html|x-www-form-urlencoded)/i.test(contentType ?? "");
    return {
        encoding: text ? "text" : "base64",
        bytes: buffer.byteLength,
        data: text ? redactString(buffer.toString("utf8")) : buffer.toString("base64"),
        truncated,
    };
}
function skippedBody(bytes) {
    return { encoding: "text", bytes, data: "", truncated: true };
}
function declaredLength(headers) {
    const value = headers["content-length"];
    if (!value || !/^\d+$/.test(value))
        return undefined;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
}
export class NetworkCapture {
    sessions;
    captures = new Map();
    constructor(sessions) {
        this.sessions = sessions;
    }
    key(sessionId, pageId) { return `${sessionId}:${pageId}`; }
    async execute(input) {
        const session = this.sessions.get(input.sessionId);
        const page = this.sessions.getPage(session.id, input.pageId);
        const pageId = this.sessions.pageId(session, page);
        const key = this.key(session.id, pageId);
        if (input.operation === "start") {
            await this.stopKey(key);
            const maxBodyBytes = input.maxBodyBytes ?? 64_000;
            const state = this.createState(page, input.includeBodies ?? false, input.maxEntries ?? 500, maxBodyBytes, input.maxTotalBytes ?? Math.min(10_000_000, maxBodyBytes * Math.min(input.maxEntries ?? 500, 100)), input.maxPendingTasks ?? 32);
            this.captures.set(key, state);
            const cdpReady = await this.installCdp(state).catch(() => false);
            if (!cdpReady) {
                page.on("request", state.onRequest);
                page.on("response", state.onResponse);
                page.on("requestfailed", state.onFailed);
            }
            page.once("close", state.onPageClose);
            return { sessionId: session.id, pageId, capturing: true, includeBodies: state.includeBodies, bodyMode: cdpReady ? "stream" : "metadata-only" };
        }
        const state = this.captures.get(key);
        if (input.operation === "read") {
            if (!state)
                return { sessionId: session.id, pageId, capturing: false, records: [] };
            await this.drain(state);
            const records = redact([...state.records]);
            if (input.clear)
                this.clearState(state);
            return { sessionId: session.id, pageId, capturing: true, records };
        }
        if (input.operation === "clear") {
            if (state)
                this.clearState(state);
            return { sessionId: session.id, pageId, cleared: true };
        }
        await this.stopKey(key);
        return { sessionId: session.id, pageId, capturing: false };
    }
    clearState(state) {
        for (const record of state.records)
            state.activeRecords.delete(record);
        state.records.length = 0;
        state.totalBodyBytes = 0;
        state.recordBytes = new WeakMap();
        state.activeRecords = new WeakSet();
    }
    createState(page, includeBodies, maxEntries, maxBodyBytes, maxTotalBytes, maxPendingTasks) {
        const state = {};
        Object.assign(state, {
            page, includeBodies, maxEntries, maxBodyBytes, maxTotalBytes, maxPendingTasks,
            totalBodyBytes: 0, sequence: 0, active: true, records: [],
            activeRecords: new WeakSet(), recordBytes: new WeakMap(),
            byRequest: new WeakMap(), byCdpRequest: new Map(),
            streams: new Map(), pending: new Set(),
        });
        const trim = () => {
            while (state.records.length > state.maxEntries) {
                const removed = state.records.shift();
                if (removed) {
                    state.activeRecords.delete(removed);
                    state.totalBodyBytes = Math.max(0, state.totalBodyBytes - (state.recordBytes.get(removed) ?? 0));
                }
            }
        };
        const addRecord = (record) => {
            state.records.push(record);
            state.activeRecords.add(record);
            trim();
        };
        const store = (record, buffer) => {
            if (!state.active || !state.activeRecords.has(record))
                return Buffer.alloc(0);
            const recordRemaining = Math.max(0, state.maxBodyBytes - (state.recordBytes.get(record) ?? 0));
            const totalRemaining = Math.max(0, state.maxTotalBytes - state.totalBodyBytes);
            const allowed = Math.min(buffer.byteLength, recordRemaining, totalRemaining);
            if (allowed <= 0)
                return Buffer.alloc(0);
            const slice = allowed === buffer.byteLength ? buffer : buffer.subarray(0, allowed);
            state.recordBytes.set(record, (state.recordBytes.get(record) ?? 0) + allowed);
            state.totalBodyBytes += allowed;
            return slice;
        };
        const schedule = (record, work) => {
            if (!state.active)
                return false;
            if (state.pending.size >= state.maxPendingTasks) {
                record.error = "network capture pending-task limit reached";
                return false;
            }
            const pending = work().catch((error) => { record.error = boundedText(error instanceof Error ? error.message : String(error), 4096); });
            state.pending.add(pending);
            void pending.finally(() => state.pending.delete(pending));
            return true;
        };
        // Safe fallback for non-Chromium/fake pages: metadata only. Playwright's
        // response.body() is deliberately never called because it buffers without a hard cap.
        state.onRequest = (request) => {
            const record = {
                id: ++state.sequence,
                method: boundedText(request.method(), 64),
                url: boundedText(request.url(), MAX_URL_BYTES),
                resourceType: boundedText(request.resourceType(), 128),
            };
            addRecord(record);
            state.byRequest.set(request, record);
            schedule(record, async () => {
                if (!state.active)
                    return;
                record.requestHeaders = boundedHeaders(await request.allHeaders());
                if (!state.includeBodies)
                    return;
                const body = request.postDataBuffer();
                if (!body)
                    return;
                const stored = store(record, body);
                record.requestBody = stored.byteLength === body.byteLength
                    ? encodeBody(stored, record.requestHeaders["content-type"])
                    : skippedBody(body.byteLength);
            });
        };
        state.onResponse = (response) => {
            const record = state.byRequest.get(response.request());
            if (!record)
                return;
            schedule(record, async () => {
                record.status = response.status();
                record.responseHeaders = boundedHeaders(await response.allHeaders());
                if (state.includeBodies)
                    record.responseBody = skippedBody(declaredLength(record.responseHeaders) ?? 0);
            });
        };
        state.onFailed = (request) => {
            const record = state.byRequest.get(request);
            if (record)
                record.error = boundedText(request.failure()?.errorText ?? "request failed", 4096);
        };
        state.onPageClose = () => { state.active = false; };
        state.onCdpRequest = (event) => {
            const headers = boundedHeaders(stringHeaders(event.request.headers));
            const record = {
                id: ++state.sequence,
                method: boundedText(event.request.method, 64),
                url: boundedText(event.request.url, MAX_URL_BYTES),
                resourceType: boundedText(event.type ?? "other", 128),
                requestHeaders: headers,
            };
            addRecord(record);
            state.byCdpRequest.set(event.requestId, record);
            if (state.includeBodies && event.request.postData !== undefined) {
                const body = Buffer.from(event.request.postData);
                const stored = store(record, body);
                record.requestBody = encodeBody(stored, headers["content-type"], stored.byteLength < body.byteLength);
            }
        };
        state.onCdpResponse = (event) => {
            const record = state.byCdpRequest.get(event.requestId);
            if (!record)
                return;
            record.status = event.response.status;
            record.url = boundedText(event.response.url, MAX_URL_BYTES);
            record.responseHeaders = boundedHeaders(stringHeaders(event.response.headers));
            if (!state.includeBodies)
                return;
            const length = declaredLength(record.responseHeaders);
            if (length !== undefined && (length > state.maxBodyBytes || length > state.maxTotalBytes - state.totalBodyBytes)) {
                record.responseBody = skippedBody(length);
                return;
            }
            const contentType = record.responseHeaders["content-type"] ?? event.response.mimeType;
            const stream = {
                record, chunks: [], bytes: 0, truncated: false, setupPending: length === undefined, finished: false,
                ...(contentType ? { contentType } : {}),
            };
            state.streams.set(event.requestId, stream);
            // Known-length bodies are fetched only after loading and only after the
            // declared size passed both caps. Unknown/chunked bodies must use CDP's
            // incremental stream to avoid unbounded getResponseBody buffering.
            if (length === undefined) {
                const scheduled = schedule(record, async () => {
                    if (!state.active || !state.activeRecords.has(record))
                        return;
                    try {
                        const result = await state.cdp.send("Network.streamResourceContent", { requestId: event.requestId });
                        if (result.bufferedData)
                            this.storeStreamChunk(state, stream, Buffer.from(result.bufferedData, "base64"), store);
                    }
                    finally {
                        stream.setupPending = false;
                        if (stream.finished)
                            this.finishStream(state, event.requestId);
                    }
                });
                if (!scheduled)
                    stream.setupPending = false;
            }
        };
        state.onCdpData = (event) => {
            const stream = state.streams.get(event.requestId);
            if (!stream || !event.data)
                return;
            this.storeStreamChunk(state, stream, Buffer.from(event.data, "base64"), store);
        };
        state.onCdpFinished = (event) => {
            const stream = state.streams.get(event.requestId);
            if (!stream) {
                state.byCdpRequest.delete(event.requestId);
                return;
            }
            const length = declaredLength(stream.record.responseHeaders ?? {});
            if (length === undefined) {
                if (stream.setupPending)
                    stream.finished = true;
                else
                    this.finishStream(state, event.requestId);
                return;
            }
            const scheduled = schedule(stream.record, async () => {
                if (!state.active || !state.activeRecords.has(stream.record))
                    return;
                try {
                    const result = await state.cdp.send("Network.getResponseBody", { requestId: event.requestId });
                    const body = Buffer.from(result.body, result.base64Encoded ? "base64" : "utf8");
                    this.storeStreamChunk(state, stream, body, store);
                    delete stream.record.error;
                }
                finally {
                    this.finishStream(state, event.requestId);
                }
            });
            if (!scheduled)
                this.finishStream(state, event.requestId);
        };
        state.onCdpFailed = (event) => {
            const record = state.byCdpRequest.get(event.requestId);
            if (record)
                record.error = boundedText(event.errorText ?? "request failed", 4096);
            const stream = state.streams.get(event.requestId);
            if (stream?.setupPending)
                stream.finished = true;
            else if (stream)
                this.finishStream(state, event.requestId);
            else
                state.byCdpRequest.delete(event.requestId);
        };
        return state;
    }
    storeStreamChunk(state, stream, chunk, store) {
        if (!state.active || !state.activeRecords.has(stream.record) || stream.truncated)
            return;
        const stored = store(stream.record, chunk);
        if (stored.byteLength) {
            stream.chunks.push(stored);
            stream.bytes += stored.byteLength;
        }
        if (stored.byteLength < chunk.byteLength)
            stream.truncated = true;
    }
    finishStream(state, requestId) {
        const stream = state.streams.get(requestId);
        state.streams.delete(requestId);
        state.byCdpRequest.delete(requestId);
        if (!stream || !state.activeRecords.has(stream.record))
            return;
        const body = Buffer.concat(stream.chunks, stream.bytes);
        stream.record.responseBody = encodeBody(body, stream.contentType, stream.truncated);
        stream.chunks.length = 0;
    }
    async installCdp(state) {
        const context = state.page.context?.();
        if (!context || typeof context.newCDPSession !== "function")
            return false;
        const cdp = await context.newCDPSession(state.page);
        state.cdp = cdp;
        cdp.on("Network.requestWillBeSent", state.onCdpRequest);
        cdp.on("Network.responseReceived", state.onCdpResponse);
        cdp.on("Network.dataReceived", state.onCdpData);
        cdp.on("Network.loadingFinished", state.onCdpFinished);
        cdp.on("Network.loadingFailed", state.onCdpFailed);
        await cdp.send("Network.enable", {
            maxTotalBufferSize: state.maxTotalBytes,
            maxResourceBufferSize: state.maxBodyBytes,
            maxPostDataSize: state.maxBodyBytes,
        });
        return true;
    }
    async drain(state) {
        if (state.pending.size === 0)
            return;
        await Promise.race([
            Promise.allSettled([...state.pending]).then(() => undefined),
            new Promise((resolve) => setTimeout(resolve, DRAIN_TIMEOUT_MS)),
        ]);
    }
    async stopKey(key) {
        const state = this.captures.get(key);
        if (!state)
            return;
        this.captures.delete(key);
        state.active = false;
        state.page.off("request", state.onRequest);
        state.page.off("response", state.onResponse);
        state.page.off("requestfailed", state.onFailed);
        state.page.off("close", state.onPageClose);
        if (state.cdp) {
            state.cdp.off("Network.requestWillBeSent", state.onCdpRequest);
            state.cdp.off("Network.responseReceived", state.onCdpResponse);
            state.cdp.off("Network.dataReceived", state.onCdpData);
            state.cdp.off("Network.loadingFinished", state.onCdpFinished);
            state.cdp.off("Network.loadingFailed", state.onCdpFailed);
            await state.cdp.send("Network.disable").catch(() => undefined);
            await state.cdp.detach().catch(() => undefined);
        }
        await this.drain(state);
        state.pending.clear();
        state.streams.clear();
        state.byCdpRequest.clear();
    }
    async stopAll() {
        await Promise.all([...this.captures.keys()].map((key) => this.stopKey(key)));
    }
}
