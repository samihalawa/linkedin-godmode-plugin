import { mkdtemp, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { RuntimeConfig } from "../src/config.js";

export async function tempConfig(overrides: Partial<RuntimeConfig> = {}): Promise<RuntimeConfig> {
  const base = resolve(".tmp-tests");
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, "linkedin-godmode-test-"));
  const stateDir = join(root, "state");
  const profileDir = join(stateDir, "profiles");
  await mkdir(profileDir, { recursive: true, mode: 0o700 });
  return {
    configFile: join(root, "config.json"), stateDir, profileDir, defaultProvider: "local", headless: true,
    readOnly: false, hostAllowlist: [], timeoutMs: 10_000, maxOutputBytes: 2_000_000,
    maxResponseBytes: 1_000_000, aliases: {}, browserbase: {}, anchor: {}, ...overrides,
  };
}
