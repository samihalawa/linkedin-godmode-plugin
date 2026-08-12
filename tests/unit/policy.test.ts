import { describe, expect, it } from "vitest";
import { isPageUrlAllowed } from "../../src/policy.js";
import { tempConfig } from "../helpers.js";

describe("page URL policy", () => {
  it("ignores Chromium's aborted-navigation document without allowing caller-controlled schemes", async () => {
    const config = await tempConfig({ hostAllowlist: ["example.com"] });
    expect(isPageUrlAllowed("chrome-error://chromewebdata/", config)).toBe(true);
    expect(isPageUrlAllowed("about:blank", config)).toBe(true);
    expect(isPageUrlAllowed("data:text/html,blocked", config)).toBe(false);
    expect(isPageUrlAllowed("file:///tmp/blocked", config)).toBe(false);
  });
});
