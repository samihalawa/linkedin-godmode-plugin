import { describe, expect, it } from "vitest";
import { redact, redactString, safeHeaders } from "../../src/redaction.js";
import { asSafeError, GodmodeError } from "../../src/errors.js";

describe("redaction", () => {
  it("redacts recursive camel/snake/kebab secret keys", () => {
    const value: Record<string, unknown> = {
      accessToken: "a1", refresh_token: "a2", "client-secret": "a3", apiKey: "a4", auth: "a5",
      csrfToken: "a6", cookie: "a7", "set-cookie": "a8", password: "a9", cdpUrl: "wss://host?token=a10",
      nested: [{ ProxyAuthorization: "a11" }],
    };
    value.self = value;
    const output = JSON.stringify(redact(value));
    for (let index = 1; index <= 11; index += 1) expect(output).not.toContain(`a${index}`);
    expect(output).toContain("[CIRCULAR]");
  });

  it("redacts raw JSON, form, URL userinfo/query secrets, signed CDP URLs, and network-style text", () => {
    const raw = [
      '{"accessToken":"JSON_ACCESS","client_secret":"JSON_CLIENT","password":"JSON_PASS"}',
      "refresh_token=FORM_REFRESH&csrf-token=FORM_CSRF&ordinary=profile",
      "https://USER_SECRET:PASS_SECRET@example.com/path?access_token=URL_ACCESS&signature=URL_SIG&ordinary=public",
      "wss://cdp.example/connect?apiKey=CDP_KEY&sessionToken=CDP_SESSION",
      "Authorization: Bearer AUTH_SECRET\nCookie: li_at=COOKIE_SECRET; ordinary=x\nSet-Cookie: sid=SET_COOKIE_SECRET",
    ].join("\n");
    const output = redactString(raw);
    for (const secret of ["JSON_ACCESS", "JSON_CLIENT", "JSON_PASS", "FORM_REFRESH", "FORM_CSRF", "USER_SECRET", "PASS_SECRET", "URL_ACCESS", "URL_SIG", "CDP_KEY", "CDP_SESSION", "AUTH_SECRET", "COOKIE_SECRET", "SET_COOKIE_SECRET"]) {
      expect(output).not.toContain(secret);
    }
    expect(output).toContain("ordinary=public");
  });

  it("does not over-redact ordinary LinkedIn profile data", () => {
    const ordinary = {
      headline: "Authentication engineer and tokenization researcher",
      about: "I write about authorization systems, cookies as a web concept, and API design.",
      publicProfileUrl: "https://www.linkedin.com/in/example?trk=public_profile",
      company: "Access Talent",
    };
    expect(redact(ordinary)).toEqual(ordinary);
  });

  it("removes sensitive response headers and sanitizes errors", () => {
    expect(safeHeaders({ "content-type": "text/plain", "set-cookie": "x=y", authorization: "secret", "x-api-key": "key" })).toEqual({ "content-type": "text/plain" });
    const safe = asSafeError(new GodmodeError("PROVIDER_ERROR", "failed Bearer abc", { cookie: "x" }));
    expect(JSON.stringify(safe)).not.toContain("abc");
    expect(JSON.stringify(safe)).not.toContain('"x"');
  });
});
