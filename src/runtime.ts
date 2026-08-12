import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { chromium } from "playwright";
import { BrowserOperations } from "./browser.js";
import { directoryMode, resolveConfig, type RuntimeConfig } from "./config.js";
import { asSafeError, GodmodeError } from "./errors.js";
import { HttpOperations } from "./http.js";
import { NetworkCapture } from "./network.js";
import { boundedJson } from "./policy.js";
import { redact } from "./redaction.js";
import {
  BrowserActInputSchema,
  BrowserCaptureInputSchema,
  BrowserEvaluateInputSchema,
  BrowserNavigateInputSchema,
  BrowserNetworkInputSchema,
  BrowserSessionInputSchema,
  BrowserTaskInputSchema,
  DoctorInputSchema,
  HttpRequestInputSchema,
} from "./schemas.js";
import { SessionManager } from "./sessions.js";
import { BrowserTasks } from "./tasks.js";

export const TOOL_DEFINITIONS = {
  browser_session: {
    description: "Create, attach, list, inspect, or close generic browser sessions and pages.",
    schema: BrowserSessionInputSchema,
  },
  http_request: {
    description: "Make a bounded generic HTTP request, optionally sharing a browser session cookie jar in memory.",
    schema: HttpRequestInputSchema,
  },
  browser_navigate: {
    description: "Navigate a browser page with goto, back, forward, or reload.",
    schema: BrowserNavigateInputSchema,
  },
  browser_act: {
    description: "Perform a generic locator action using CSS, role, text, label, placeholder, test ID, or XPath.",
    schema: BrowserActInputSchema,
  },
  browser_evaluate: {
    description: "Explicitly evaluate caller-provided JavaScript in a browser page with a JSON argument.",
    schema: BrowserEvaluateInputSchema,
  },
  browser_capture: {
    description: "Capture a bounded screenshot, HTML, accessibility snapshot, or visible text.",
    schema: BrowserCaptureInputSchema,
  },
  browser_network: {
    description: "Start, read, clear, or stop bounded generic page network capture; bodies require explicit opt-in.",
    schema: BrowserNetworkInputSchema,
  },
  browser_task: {
    description: "Explicitly invoke an Anchor or Browserbase hosted browser task; never invoked by other tools.",
    schema: BrowserTaskInputSchema,
  },
  doctor: {
    description: "Report local runtime, configuration, and provider readiness without exposing secrets.",
    schema: DoctorInputSchema,
  },
} as const;

export type ToolName = keyof typeof TOOL_DEFINITIONS;
export const TOOL_NAMES = Object.keys(TOOL_DEFINITIONS) as ToolName[];

export class GodmodeRuntime {
  readonly sessions: SessionManager;
  readonly browser: BrowserOperations;
  readonly network: NetworkCapture;
  readonly http: HttpOperations;
  readonly tasks: BrowserTasks;

  constructor(readonly config: RuntimeConfig) {
    this.sessions = new SessionManager(config);
    this.browser = new BrowserOperations(this.sessions, config);
    this.network = new NetworkCapture(this.sessions);
    this.http = new HttpOperations(this.sessions, config);
    this.tasks = new BrowserTasks(this.sessions, config);
  }

  async call(tool: string, input: unknown): Promise<unknown> {
    if (!TOOL_NAMES.includes(tool as ToolName)) throw new GodmodeError("NOT_FOUND", `Unknown tool: ${tool}`);
    const name = tool as ToolName;
    const parsedResult = TOOL_DEFINITIONS[name].schema.safeParse(input);
    if (!parsedResult.success) throw new GodmodeError("BAD_INPUT", `Invalid ${name} input`, parsedResult.error.issues);
    const parsed = parsedResult.data;
    let output: unknown;
    switch (name) {
      case "browser_session": output = await this.sessions.execute(parsed as never); break;
      case "http_request": output = await this.http.request(parsed as never); break;
      case "browser_navigate": output = await this.browser.navigate(parsed as never); break;
      case "browser_act": output = await this.browser.act(parsed as never); break;
      case "browser_evaluate": output = await this.browser.evaluate(parsed as never); break;
      case "browser_capture": output = await this.browser.capture(parsed as never); break;
      case "browser_network": output = await this.network.execute(parsed as never); break;
      case "browser_task": output = await this.tasks.execute(parsed as never); break;
      case "doctor": output = await this.doctor(); break;
    }
    return boundedJson(redact(output), this.config.maxOutputBytes);
  }

  async doctor(): Promise<unknown> {
    let browserExecutable = false;
    try { await access(chromium.executablePath(), constants.X_OK); browserExecutable = true; } catch { browserExecutable = false; }
    let configFilePresent = false;
    try { await access(this.config.configFile, constants.R_OK); configFilePresent = true; } catch { configFilePresent = false; }
    return {
      ok: browserExecutable,
      node: process.version,
      platform: process.platform,
      browserExecutable,
      stateDir: { ready: true, mode: await directoryMode(this.config.stateDir) },
      profileDir: { ready: true, mode: await directoryMode(this.config.profileDir) },
      configFile: { present: configFilePresent },
      policy: { readOnly: this.config.readOnly, hostAllowlistCount: this.config.hostAllowlist.length },
      providers: {
        local: { ready: browserExecutable, persistentProfile: true },
        browserbase: { configured: Boolean(process.env.BROWSERBASE_API_KEY), projectConfigured: Boolean(this.config.browserbase.projectId), liveValidated: false },
        anchor: { configured: Boolean(process.env.ANCHOR_API_KEY ?? process.env.ANCHORBROWSER_API_KEY), liveValidated: false },
      },
    };
  }

  async safeCall(tool: string, input: unknown): Promise<{ ok: true; result: unknown } | { ok: false; error: ReturnType<typeof asSafeError> }> {
    try { return { ok: true, result: await this.call(tool, input) }; }
    catch (error) { return { ok: false, error: asSafeError(error) }; }
  }

  async close(): Promise<void> {
    await this.network.stopAll();
    await this.sessions.closeAll();
  }
}

export async function createRuntime(configFile?: string): Promise<GodmodeRuntime> {
  return new GodmodeRuntime(await resolveConfig(configFile));
}
