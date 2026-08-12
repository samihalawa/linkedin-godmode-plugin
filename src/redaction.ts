const SENSITIVE_NORMALIZED = new Set([
  "authorization", "proxyauthorization", "auth", "cookie", "setcookie", "password", "passwd",
  "apikey", "clientsecret", "secret", "csrftoken", "xsrftoken", "token", "accesstoken",
  "refreshtoken", "idtoken", "sessiontoken", "securitytoken", "privatekey", "cdpurl", "connecturl",
  "signingkey", "signature", "sig", "credential", "credentials",
]);
const BEARER_TEXT = /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const COOKIE_HEADER_TEXT = /\b(?:Cookie|Set-Cookie)\s*:\s*[^\r\n]+/gi;
const KNOWN_COOKIE_TEXT = /\b(?:li_at|JSESSIONID|bcookie|bscookie|lidc)=([^;\s]+)/gi;
const URL_TEXT = /\b(?:https?|wss?):\/\/[^\s"'<>]+/gi;
const QUOTED_ASSIGNMENT = /(["']?)([A-Za-z][A-Za-z0-9_.-]{1,80})\1(\s*[:=]\s*)(["'])((?:\\.|(?!\4).)*)\4/gi;
const BARE_ASSIGNMENT = /\b([A-Za-z][A-Za-z0-9_.-]{1,80})(\s*[:=]\s*)([^&;\s,}\]]+)/gi;

export const REDACTED = "[REDACTED]";

function normalizeKey(key: string): string { return key.replace(/[^A-Za-z0-9]/g, "").toLowerCase(); }

export function containsSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return SENSITIVE_NORMALIZED.has(normalized)
    || /(?:^|x)(?:access|refresh|session|security|id|csrf|xsrf|api)token$/.test(normalized)
    || /(?:apikey|clientsecret|privatekey|signingkey|csrftoken|xsrftoken|authorization|password|passwd|signature|credential|cdpurl|connecturl)$/.test(normalized);
}

function redactUrl(match: string): string {
  const trailing = match.match(/[),.;]+$/)?.[0] ?? "";
  const raw = trailing ? match.slice(0, -trailing.length) : match;
  try {
    const url = new URL(raw);
    if (url.username) url.username = REDACTED;
    if (url.password) url.password = REDACTED;
    for (const key of [...url.searchParams.keys()]) {
      if (containsSensitiveKey(key)) url.searchParams.set(key, REDACTED);
    }
    if (url.hash && /(?:token|secret|signature|credential|password|cookie|auth)/i.test(url.hash)) url.hash = REDACTED;
    return `${url.toString()}${trailing}`;
  } catch {
    return match;
  }
}

function redactEnvironmentSecrets(value: string): string {
  let output = value;
  for (const [key, secret] of Object.entries(process.env)) {
    if (secret && secret.length >= 8 && containsSensitiveKey(key)) output = output.split(secret).join(REDACTED);
  }
  return output;
}

function redactStructuredString(value: string): string | undefined {
  const trimmed = value.trim();
  if ((!trimmed.startsWith("{") || !trimmed.endsWith("}")) && (!trimmed.startsWith("[") || !trimmed.endsWith("]"))) return undefined;
  try { return JSON.stringify(redact(JSON.parse(trimmed) as unknown)); }
  catch { return undefined; }
}

export function redactString(value: string): string {
  const structured = redactStructuredString(value);
  const source = structured ?? value;
  return redactEnvironmentSecrets(source
    .replace(URL_TEXT, redactUrl)
    .replace(COOKIE_HEADER_TEXT, (match) => `${match.slice(0, match.indexOf(":") + 1)} ${REDACTED}`)
    .replace(KNOWN_COOKIE_TEXT, (match) => `${match.slice(0, match.indexOf("=") + 1)}${REDACTED}`)
    .replace(BEARER_TEXT, REDACTED)
    .replace(QUOTED_ASSIGNMENT, (match, keyQuote: string, key: string, separator: string, valueQuote: string) =>
      containsSensitiveKey(key) ? `${keyQuote}${key}${keyQuote}${separator}${valueQuote}${REDACTED}${valueQuote}` : match)
    .replace(BARE_ASSIGNMENT, (match, key: string, separator: string) =>
      containsSensitiveKey(key) ? `${key}${separator}${REDACTED}` : match));
}

export function redact(value: unknown, maxDepth = 8): unknown {
  const seen = new WeakSet<object>();
  const visit = (current: unknown, depth: number): unknown => {
    if (typeof current === "string") return redactString(current);
    if (typeof current === "bigint") return current.toString();
    if (current === null || typeof current !== "object") return current;
    if (depth > maxDepth) return "[TRUNCATED]";
    if (seen.has(current)) return "[CIRCULAR]";
    seen.add(current);
    if (Array.isArray(current)) return current.map((item) => visit(item, depth + 1));
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(current)) output[key] = containsSensitiveKey(key) ? REDACTED : visit(item, depth + 1);
    return output;
  };
  return visit(value, 0);
}

export function safeHeaders(headers: Record<string, string>): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) if (!containsSensitiveKey(key)) output[key] = redactString(value);
  return output;
}
