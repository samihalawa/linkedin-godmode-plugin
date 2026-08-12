import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";
import type { BrowserContext } from "playwright";
import type { RuntimeConfig } from "./config.js";
import { GodmodeError } from "./errors.js";
import { assertHttpMethodAllowed, assertUrlAllowed } from "./policy.js";
import { containsSensitiveKey, safeHeaders } from "./redaction.js";
import type { HttpRequestInput } from "./schemas.js";
import type { SessionManager } from "./sessions.js";

interface RawResponse {
  status: number;
  statusText: string;
  url: string;
  headers: Record<string, string>;
  body: Buffer;
}

type PreparedBody = { body?: BodyInit; contentType?: string };

export function deriveCsrfToken(cookieValue: string): string {
  const trimmed = cookieValue.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1);
  return trimmed;
}

function scalar(value: string | number | boolean): string { return String(value); }

function prepareBody(input: HttpRequestInput): PreparedBody {
  if (!input.body) return {};
  if (input.body.type === "json") return { body: JSON.stringify(input.body.value), contentType: "application/json" };
  if (input.body.type === "text") return { body: input.body.value, contentType: "text/plain; charset=utf-8" };
  if (input.body.type === "base64") return { body: new Uint8Array(Buffer.from(input.body.value, "base64")) };
  if (input.body.type === "form") {
    const form = new URLSearchParams();
    for (const [key, raw] of Object.entries(input.body.fields)) {
      for (const value of Array.isArray(raw) ? raw : [raw]) form.append(key, scalar(value));
    }
    return { body: form.toString(), contentType: "application/x-www-form-urlencoded;charset=UTF-8" };
  }
  const form = new FormData();
  for (const [key, raw] of Object.entries(input.body.fields ?? {})) {
    for (const value of Array.isArray(raw) ? raw : [raw]) form.append(key, scalar(value));
  }
  for (const file of input.body.files ?? []) {
    const bytes = Buffer.from(file.dataBase64, "base64");
    form.append(file.field, new Blob([bytes], file.contentType ? { type: file.contentType } : {}), file.filename);
  }
  return { body: form };
}

function redirectMethod(status: number, method: string): string {
  return status === 303 || ((status === 301 || status === 302) && method === "POST") ? "GET" : method;
}

function isRedirect(status: number): boolean { return [301, 302, 303, 307, 308].includes(status); }

function secretEnvironmentValues(): Set<string> {
  const values = new Set<string>();
  for (const [key, value] of Object.entries(process.env)) {
    if (value && value.length >= 8 && containsSensitiveKey(key)) values.add(value);
  }
  return values;
}

function stripCrossOriginHeaders(headers: Record<string, string>): Record<string, string> {
  const envSecrets = secretEnvironmentValues();
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const normalized = key.toLowerCase();
    const originBound = normalized === "origin" || normalized === "referer" || normalized === "csrf-token"
      || normalized === "x-csrf-token" || normalized === "x-xsrf-token" || containsSensitiveKey(normalized)
      || /(?:^|[-_])(auth|credential|secret|token|key|signature|session)(?:$|[-_])/.test(normalized);
    if (!originBound && !envSecrets.has(value)) output[key] = value;
  }
  return output;
}

async function contextCookieHeader(context: BrowserContext | undefined, url: string): Promise<string | undefined> {
  if (!context) return undefined;
  const cookies = await context.cookies(url);
  if (cookies.length === 0) return undefined;
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

async function readCappedBody(response: Response, maxBytes: number, controller: AbortController): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        controller.abort();
        await reader.cancel().catch(() => undefined);
        throw new GodmodeError("OUTPUT_TOO_LARGE", `HTTP response exceeds ${maxBytes} bytes`);
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, total);
  } finally {
    reader.releaseLock();
  }
}

export class HttpOperations {
  constructor(private readonly sessions: SessionManager, private readonly config: RuntimeConfig) {}

  async request(input: HttpRequestInput): Promise<unknown> {
    let url = assertUrlAllowed(input.url, this.config);
    let method = input.method ?? "GET";
    assertHttpMethodAllowed(method, this.config);
    let headers: Record<string, string> = { ...(input.headers ?? {}) };
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === "cookie") throw new GodmodeError("POLICY_DENIED", "Literal Cookie headers are not accepted; use sessionId cookie injection");
    }
    const prepared = prepareBody(input);
    if (prepared.contentType && !Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) headers["content-type"] = prepared.contentType;
    const context = input.sessionId ? this.sessions.get(input.sessionId).lease.context : undefined;
    if (input.linkedinWebPreset) {
      if (!context) throw new GodmodeError("BAD_INPUT", "linkedinWebPreset requires sessionId");
      if (url.hostname !== "linkedin.com" && !url.hostname.endsWith(".linkedin.com")) {
        throw new GodmodeError("POLICY_DENIED", "linkedinWebPreset is only valid for linkedin.com hosts");
      }
      const cookies = await context.cookies(url.toString());
      const jsession = cookies.find((cookie) => cookie.name === "JSESSIONID");
      if (!jsession) throw new GodmodeError("AUTH_REQUIRED", "The browser session has no JSESSIONID cookie for this URL");
      headers["csrf-token"] = deriveCsrfToken(jsession.value);
    }
    const timeout = input.timeoutMs ?? this.config.timeoutMs;
    const maxBytes = Math.min(input.maxResponseBytes ?? this.config.maxResponseBytes, this.config.maxResponseBytes);
    let body = prepared.body;
    let raw: RawResponse | undefined;
    for (let redirects = 0; redirects <= 10; redirects += 1) {
      raw = await this.nodeFetch(url.toString(), method, headers, body, timeout, maxBytes, input.responseType ?? "auto", context);
      if (!isRedirect(raw.status)) break;
      const location = raw.headers.location;
      if (!location) break;
      if (redirects === 10) throw new GodmodeError("PROVIDER_ERROR", "Too many HTTP redirects");
      const nextUrl = assertUrlAllowed(new URL(location, url).toString(), this.config);
      if (nextUrl.origin !== url.origin) headers = stripCrossOriginHeaders(headers);
      const nextMethod = redirectMethod(raw.status, method);
      if (nextMethod === "GET" && nextMethod !== method) {
        body = undefined;
        for (const key of Object.keys(headers)) if (["content-type", "content-length", "transfer-encoding"].includes(key.toLowerCase())) delete headers[key];
      }
      method = nextMethod;
      assertHttpMethodAllowed(method, this.config);
      url = nextUrl;
    }
    if (!raw) throw new GodmodeError("INTERNAL", "HTTP request produced no response");
    return this.formatResponse(raw, input.responseType ?? "auto");
  }

  private async nativeTokenRequest(
    url: string,
    method: string,
    headers: Record<string, string>,
    timeout: number,
    maxBytes: number,
    responseType: NonNullable<HttpRequestInput["responseType"]>,
    context?: BrowserContext,
  ): Promise<RawResponse> {
    const parsed = new URL(url);
    const hopHeaders = { ...headers };
    const cookie = await contextCookieHeader(context, url);
    if (cookie) hopHeaders.cookie = cookie;
    const request = parsed.protocol === "https:" ? httpsRequest : httpRequest;
    return new Promise<RawResponse>((resolve, reject) => {
      const finish = (status: number, statusText: string, responseHeaders: IncomingHttpHeaders, stream: NodeJS.ReadableStream) => {
        const normalized: Record<string, string> = {};
        for (const [key, value] of Object.entries(responseHeaders)) if (value !== undefined) normalized[key] = Array.isArray(value) ? value.join(", ") : String(value);
        const noBody = responseType === "none" || method === "HEAD" || isRedirect(status);
        const chunks: Buffer[] = [];
        let total = 0;
        stream.on("data", (chunk: Buffer | string) => {
          if (noBody) return;
          const buffer = Buffer.from(chunk);
          total += buffer.byteLength;
          if (total > maxBytes) {
            req.destroy();
            reject(new GodmodeError("OUTPUT_TOO_LARGE", `HTTP response exceeds ${maxBytes} bytes`));
            return;
          }
          chunks.push(buffer);
        });
        stream.once("end", () => resolve({ status, statusText, url, headers: normalized, body: noBody ? Buffer.alloc(0) : Buffer.concat(chunks, total) }));
      };
      const req = request(parsed, { method, headers: hopHeaders });
      req.setTimeout(timeout, () => req.destroy(new GodmodeError("TIMEOUT", `HTTP request timed out after ${timeout}ms`)));
      req.once("response", (response) => finish(response.statusCode ?? 0, response.statusMessage ?? "", response.headers, response));
      req.once("connect", (response, socket, head) => {
        if (head.byteLength > maxBytes) { socket.destroy(); reject(new GodmodeError("OUTPUT_TOO_LARGE", `HTTP response exceeds ${maxBytes} bytes`)); return; }
        socket.end();
        resolve({ status: response.statusCode ?? 0, statusText: response.statusMessage ?? "", url, headers: Object.fromEntries(Object.entries(response.headers).filter((entry): entry is [string, string | string[]] => entry[1] !== undefined).map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : value])), body: responseType === "none" ? Buffer.alloc(0) : head });
      });
      req.once("error", (error) => reject(error instanceof GodmodeError ? error : new GodmodeError("PROVIDER_ERROR", "HTTP request failed", undefined, { cause: error })));
      req.end();
    });
  }

  private async nodeFetch(
    url: string,
    method: string,
    headers: Record<string, string>,
    body: BodyInit | undefined,
    timeout: number,
    maxBytes: number,
    responseType: NonNullable<HttpRequestInput["responseType"]>,
    context?: BrowserContext,
  ): Promise<RawResponse> {
    if (method === "CONNECT" || method === "TRACE") {
      if (body !== undefined) throw new GodmodeError("UNSUPPORTED", `${method} request bodies are not supported`);
      return this.nativeTokenRequest(url, method, headers, timeout, maxBytes, responseType, context);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const hopHeaders = { ...headers };
      const cookie = await contextCookieHeader(context, url);
      if (cookie) hopHeaders.cookie = cookie;
      const response = await fetch(url, {
        method,
        headers: hopHeaders,
        ...(body !== undefined ? { body } : {}),
        redirect: "manual",
        signal: controller.signal,
      });
      const responseHeaders = Object.fromEntries(response.headers.entries());
      const contentLength = Number(responseHeaders["content-length"] ?? 0);
      const noBody = responseType === "none" || method === "HEAD" || isRedirect(response.status);
      if (!noBody && Number.isFinite(contentLength) && contentLength > maxBytes) {
        controller.abort();
        throw new GodmodeError("OUTPUT_TOO_LARGE", `HTTP response exceeds ${maxBytes} bytes`);
      }
      const responseBody = noBody ? (await response.body?.cancel().catch(() => undefined), Buffer.alloc(0)) : await readCappedBody(response, maxBytes, controller);
      return { status: response.status, statusText: response.statusText, url: response.url || url, headers: responseHeaders, body: responseBody };
    } catch (error) {
      if (error instanceof GodmodeError) throw error;
      if ((error as Error).name === "AbortError") throw new GodmodeError("TIMEOUT", `HTTP request timed out after ${timeout}ms`);
      throw new GodmodeError("PROVIDER_ERROR", "HTTP request failed", undefined, { cause: error });
    } finally {
      clearTimeout(timer);
    }
  }

  private formatResponse(raw: RawResponse, responseType: NonNullable<HttpRequestInput["responseType"]>): unknown {
    const headers = safeHeaders(raw.headers);
    const base = { status: raw.status, statusText: raw.statusText, ok: raw.status >= 200 && raw.status < 300, url: raw.url, headers, bytes: raw.body.byteLength };
    if (responseType === "none") return base;
    const contentType = raw.headers["content-type"] ?? "";
    if (responseType === "base64") return { ...base, encoding: "base64", body: raw.body.toString("base64") };
    const text = raw.body.toString("utf8");
    if (responseType === "json" || (responseType === "auto" && /json/i.test(contentType))) {
      try { return { ...base, body: JSON.parse(text) as unknown }; }
      catch (error) { throw new GodmodeError("PROVIDER_ERROR", "Response body is not valid JSON", undefined, { cause: error }); }
    }
    return { ...base, encoding: "text", body: text };
  }
}

export function assertNoCookieHeader(headers: Record<string, string> | undefined): void {
  for (const key of Object.keys(headers ?? {})) {
    if (key.toLowerCase() === "cookie" || containsSensitiveKey(key) && key.toLowerCase().includes("cookie")) {
      throw new GodmodeError("POLICY_DENIED", "Cookie headers are not accepted");
    }
  }
}
