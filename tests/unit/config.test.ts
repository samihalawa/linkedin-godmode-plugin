import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { resolveConfig } from "../../src/config.js";

const ORIGINAL = { ...process.env };
afterEach(() => { process.env = { ...ORIGINAL }; });

describe("config", () => {
  it("loads strict non-secret config and applies environment overrides", async () => {
    const root = await mkdtemp(join(resolve(".tmp-tests"), "godmode-config-"));
    const filename = join(root, "config.json");
    await writeFile(filename, JSON.stringify({ defaultProvider: "anchor", timeoutMs: 5000, aliases: { anchorProfiles: { p: "profile-p" } } }));
    process.env.LINKEDIN_GODMODE_STATE_DIR = join(root, "state");
    process.env.LINKEDIN_GODMODE_DEFAULT_PROVIDER = "local";
    process.env.LINKEDIN_GODMODE_READ_ONLY = "true";
    const config = await resolveConfig(filename);
    expect(config.defaultProvider).toBe("local");
    expect(config.readOnly).toBe(true);
    expect(config.timeoutMs).toBe(5000);
    expect(config.aliases.anchorProfiles?.p).toBe("profile-p");
    expect((await stat(config.profileDir)).mode & 0o777).toBe(0o700);
    expect(await readFile(filename, "utf8")).not.toMatch(/api.?key|cookie|secret/i);
  });

  it("rejects unknown or secret-like config fields", async () => {
    const root = await mkdtemp(join(resolve(".tmp-tests"), "godmode-config-bad-"));
    const filename = join(root, "config.json");
    await writeFile(filename, JSON.stringify({ apiKey: "not-allowed" }));
    await expect(resolveConfig(filename)).rejects.toMatchObject({ code: "BAD_INPUT" });
  });

  it("rejects malformed boolean environment values", async () => {
    const root = await mkdtemp(join(resolve(".tmp-tests"), "godmode-config-env-"));
    process.env.LINKEDIN_GODMODE_STATE_DIR = join(root, "state");
    process.env.LINKEDIN_GODMODE_READ_ONLY = "maybe";
    await expect(resolveConfig(join(root, "missing.json"))).rejects.toMatchObject({ code: "BAD_INPUT" });
  });
});
