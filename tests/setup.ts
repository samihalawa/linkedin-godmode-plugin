import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, beforeEach } from "vitest";

const root = resolve(".tmp-tests");
beforeEach(async () => { await mkdir(root, { recursive: true }); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
