import { chmod, mkdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { GodmodeError } from "./errors.js";
import { ProviderSchema, type ProviderName } from "./schemas.js";

const FileConfigSchema = z.object({
  stateDir: z.string().min(1).optional(),
  profileDir: z.string().min(1).optional(),
  defaultProvider: ProviderSchema.optional(),
  defaultSession: z.string().min(1).optional(),
  headless: z.boolean().optional(),
  readOnly: z.boolean().optional(),
  hostAllowlist: z.array(z.string().min(1)).optional(),
  timeoutMs: z.number().int().positive().max(300000).optional(),
  maxOutputBytes: z.number().int().positive().max(10_000_000).optional(),
  maxResponseBytes: z.number().int().positive().max(10_000_000).optional(),
  aliases: z.object({
    sessions: z.record(z.string(), z.object({
      provider: ProviderSchema,
      profile: z.string().optional(),
      providerSessionId: z.string().optional(),
      persistentRef: z.string().optional(),
    }).strict()).optional(),
    browserbaseContexts: z.record(z.string(), z.string()).optional(),
    anchorProfiles: z.record(z.string(), z.string()).optional(),
  }).strict().optional(),
  browserbase: z.object({
    projectId: z.string().optional(),
    region: z.enum(["us-west-2", "us-east-1", "eu-central-1", "ap-southeast-1"]).optional(),
    baseUrl: z.string().url().optional(),
  }).strict().optional(),
  anchor: z.object({
    baseUrl: z.string().url().optional(),
  }).strict().optional(),
}).strict();

export type FileConfig = z.infer<typeof FileConfigSchema>;
export interface RuntimeConfig {
  configFile: string;
  stateDir: string;
  profileDir: string;
  defaultProvider: ProviderName;
  defaultSession?: string;
  headless: boolean;
  readOnly: boolean;
  hostAllowlist: string[];
  timeoutMs: number;
  maxOutputBytes: number;
  maxResponseBytes: number;
  aliases: NonNullable<FileConfig["aliases"]>;
  browserbase: NonNullable<FileConfig["browserbase"]>;
  anchor: NonNullable<FileConfig["anchor"]>;
}

function expandHome(value: string): string {
  return value === "~" ? homedir() : value.startsWith("~/") ? join(homedir(), value.slice(2)) : value;
}

function envBoolean(name: string): boolean | undefined {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return undefined;
  if (["1", "true", "yes", "on"].includes(value.trim().toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(value.trim().toLowerCase())) return false;
  throw new GodmodeError("BAD_INPUT", `${name} must be a boolean`);
}

function envNumber(name: string): number | undefined {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new GodmodeError("BAD_INPUT", `${name} must be a positive integer`);
  return number;
}

async function readConfigFile(filename: string): Promise<FileConfig> {
  try {
    const parsed: unknown = JSON.parse(await readFile(filename, "utf8"));
    return FileConfigSchema.parse(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    if (error instanceof z.ZodError) throw new GodmodeError("BAD_INPUT", `Invalid config file ${filename}`, error.issues);
    throw new GodmodeError("BAD_INPUT", `Cannot read config file ${filename}`, undefined, { cause: error });
  }
}

export async function ensurePrivateDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
}

export async function resolveConfig(explicitFile?: string): Promise<RuntimeConfig> {
  const configFile = resolve(expandHome(explicitFile ?? process.env.LINKEDIN_GODMODE_CONFIG ?? join(homedir(), ".config", "linkedin-godmode", "config.json")));
  const file = await readConfigFile(configFile);
  const stateDir = resolve(expandHome(process.env.LINKEDIN_GODMODE_STATE_DIR ?? file.stateDir ?? join(homedir(), ".local", "state", "linkedin-godmode")));
  const profileDir = resolve(expandHome(process.env.LINKEDIN_GODMODE_PROFILE_DIR ?? file.profileDir ?? join(stateDir, "profiles")));
  const providerValue = process.env.LINKEDIN_GODMODE_DEFAULT_PROVIDER ?? file.defaultProvider ?? "local";
  const defaultProvider = ProviderSchema.parse(providerValue);
  const hostAllowlist = process.env.LINKEDIN_GODMODE_HOST_ALLOWLIST
    ? process.env.LINKEDIN_GODMODE_HOST_ALLOWLIST.split(",").map((item) => item.trim()).filter(Boolean)
    : file.hostAllowlist ?? [];
  const config: RuntimeConfig = {
    configFile,
    stateDir,
    profileDir,
    defaultProvider,
    headless: envBoolean("LINKEDIN_GODMODE_HEADLESS") ?? file.headless ?? false,
    readOnly: envBoolean("LINKEDIN_GODMODE_READ_ONLY") ?? file.readOnly ?? false,
    hostAllowlist,
    timeoutMs: envNumber("LINKEDIN_GODMODE_TIMEOUT_MS") ?? file.timeoutMs ?? 30_000,
    maxOutputBytes: envNumber("LINKEDIN_GODMODE_MAX_OUTPUT_BYTES") ?? file.maxOutputBytes ?? 1_000_000,
    maxResponseBytes: envNumber("LINKEDIN_GODMODE_MAX_RESPONSE_BYTES") ?? file.maxResponseBytes ?? 1_000_000,
    aliases: file.aliases ?? {},
    browserbase: {
      ...(file.browserbase ?? {}),
      ...(process.env.BROWSERBASE_PROJECT_ID ? { projectId: process.env.BROWSERBASE_PROJECT_ID } : {}),
      ...(process.env.LINKEDIN_GODMODE_BROWSERBASE_BASE_URL ? { baseUrl: process.env.LINKEDIN_GODMODE_BROWSERBASE_BASE_URL } : {}),
    },
    anchor: {
      ...(file.anchor ?? {}),
      ...(process.env.LINKEDIN_GODMODE_ANCHOR_BASE_URL ? { baseUrl: process.env.LINKEDIN_GODMODE_ANCHOR_BASE_URL } : {}),
    },
  };
  const defaultSession = process.env.LINKEDIN_GODMODE_DEFAULT_SESSION ?? file.defaultSession;
  if (defaultSession !== undefined) config.defaultSession = defaultSession;
  await ensurePrivateDirectory(stateDir);
  await ensurePrivateDirectory(profileDir);
  await ensurePrivateDirectory(dirname(configFile));
  return config;
}

export function getProviderSecret(provider: "browserbase" | "anchor"): string {
  const name = provider === "browserbase" ? "BROWSERBASE_API_KEY" : "ANCHOR_API_KEY";
  const value = process.env[name] ?? (provider === "anchor" ? process.env.ANCHORBROWSER_API_KEY : undefined);
  if (!value) throw new GodmodeError("AUTH_REQUIRED", `${name} is required for ${provider}`);
  return value;
}

export async function directoryMode(directory: string): Promise<string> {
  const info = await stat(directory);
  return `0${(info.mode & 0o777).toString(8)}`;
}
