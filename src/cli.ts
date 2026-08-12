#!/usr/bin/env node
import { createReadStream, realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { stdin as input, stdout as output } from "node:process";
import { asSafeError } from "./errors.js";
import { runMcp } from "./mcp.js";
import { BatchCommandSchema } from "./schemas.js";
import { createRuntime, TOOL_NAMES, type ToolName } from "./runtime.js";

const COMMAND_TO_TOOL: Record<string, ToolName> = {
  session: "browser_session", http: "http_request", navigate: "browser_navigate", act: "browser_act",
  evaluate: "browser_evaluate", capture: "browser_capture", network: "browser_network", task: "browser_task",
};

function usage(): string {
  return [
    "linkedin-godmode mcp [--config FILE]",
    "linkedin-godmode doctor [--config FILE]",
    "linkedin-godmode call TOOL JSON [--config FILE]",
    "linkedin-godmode session|http|navigate|act|evaluate|capture|network|task JSON [--config FILE]",
    "linkedin-godmode batch [FILE|-] [--config FILE]    # JSONL, one result per line",
    "linkedin-godmode run FILE [--config FILE]          # JSON array or {steps:[...]}",
  ].join("\n");
}

function extractConfig(arguments_: string[]): { arguments_: string[]; configFile?: string } {
  const copy = [...arguments_];
  const index = copy.indexOf("--config");
  if (index < 0) return { arguments_: copy };
  const value = copy[index + 1];
  if (!value) throw new Error("--config requires a file path");
  copy.splice(index, 2);
  return { arguments_: copy, configFile: value };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of input) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function parseJsonArgument(value: string | undefined): Promise<unknown> {
  if (!value) return {};
  const text = value === "-" ? await readStdin() : value;
  return JSON.parse(text) as unknown;
}

async function runBatch(filename: string | undefined, configFile?: string): Promise<boolean> {
  const runtime = await createRuntime(configFile);
  const stream = filename && filename !== "-" ? createReadStream(filename, "utf8") : input;
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  let failed = false;
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      let result: unknown;
      try {
        const command = BatchCommandSchema.parse(JSON.parse(line) as unknown);
        const called = await runtime.safeCall(command.tool, command.arguments);
        failed ||= !called.ok;
        result = { id: command.id, ...called };
      } catch (error) {
        failed = true;
        result = { id: null, ok: false, error: asSafeError(error) };
      }
      output.write(`${JSON.stringify(result)}\n`);
    }
  } finally {
    await runtime.close();
  }
  return failed;
}

async function runFile(filename: string | undefined, configFile?: string): Promise<boolean> {
  if (!filename) throw new Error("run requires a JSON file");
  const payload = JSON.parse(await readFile(filename, "utf8")) as unknown;
  const rawSteps = Array.isArray(payload) ? payload : (payload as { steps?: unknown }).steps;
  if (!Array.isArray(rawSteps)) throw new Error("run file must be a JSON array or {\"steps\": [...]} object");
  const runtime = await createRuntime(configFile);
  const results: Array<{ ok?: boolean; [key: string]: unknown }> = [];
  try {
    for (const raw of rawSteps) {
      try {
        const command = BatchCommandSchema.parse(raw);
        results.push({ id: command.id, ...(await runtime.safeCall(command.tool, command.arguments)) });
      } catch (error) {
        results.push({ id: null, ok: false, error: asSafeError(error) });
      }
    }
    output.write(`${JSON.stringify(results, null, 2)}\n`);
  } finally {
    await runtime.close();
  }
  return results.some((result) => result.ok === false);
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const extracted = extractConfig(argv);
  const [command, ...rest] = extracted.arguments_;
  if (!command || command === "help" || command === "--help" || command === "-h") { output.write(`${usage()}\n`); return 0; }
  if (command === "batch") return await runBatch(rest[0], extracted.configFile) ? 1 : 0;
  if (command === "run") return await runFile(rest[0], extracted.configFile) ? 1 : 0;
  const runtime = await createRuntime(extracted.configFile);
  if (command === "mcp") { await runMcp(runtime); return 0; }
  try {
    if (command === "doctor") {
      const result = await runtime.call("doctor", {}) as { ok?: boolean };
      output.write(`${JSON.stringify(result, null, 2)}\n`);
      return result.ok === true ? 0 : 1;
    }
    const tool = command === "call" ? rest[0] : COMMAND_TO_TOOL[command];
    const json = command === "call" ? rest[1] : rest[0];
    if (!tool || !TOOL_NAMES.includes(tool as ToolName)) throw new Error(`Unknown command or tool: ${command}`);
    const result = await runtime.safeCall(tool, await parseJsonArgument(json));
    output.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.ok ? 0 : 1;
  } finally {
    await runtime.close();
  }
}

function isEntrypoint(): boolean {
  const candidate = process.argv[1];
  if (!candidate) return false;
  try { return realpathSync(candidate) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
}

if (isEntrypoint()) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    process.stderr.write(`${JSON.stringify(asSafeError(error))}\n`);
    process.exitCode = 1;
  });
}
