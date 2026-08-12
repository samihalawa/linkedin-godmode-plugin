import Browserbase from "@browserbasehq/sdk";
import { Tools, createAnchorbrowserClient, type PerformWebTaskRequestSchema } from "anchorbrowser";
import type { RuntimeConfig } from "./config.js";
import { getProviderSecret } from "./config.js";
import { GodmodeError, invariant } from "./errors.js";
import { assertTaskAllowed, assertUrlAllowed } from "./policy.js";
import type { BrowserTaskInput } from "./schemas.js";
import type { SessionManager } from "./sessions.js";

export class BrowserTasks {
  constructor(private readonly sessions: SessionManager, private readonly config: RuntimeConfig) {}

  async execute(input: BrowserTaskInput): Promise<unknown> {
    if (input.operation === "status") {
      invariant(input.taskId, "BAD_INPUT", "taskId is required for status");
      return this.status(input.provider, input.taskId);
    }
    assertTaskAllowed(this.config);
    invariant(input.task, "BAD_INPUT", "task is required for run");
    if (input.url) assertUrlAllowed(input.url, this.config);
    if (input.provider === "browserbase") return this.runBrowserbase(input);
    return this.runAnchor(input);
  }

  private browserbaseClient(): Browserbase {
    const options: ConstructorParameters<typeof Browserbase>[0] = {
      apiKey: getProviderSecret("browserbase"), maxRetries: 0, timeout: this.config.timeoutMs,
    };
    if (this.config.browserbase.baseUrl) options.baseURL = this.config.browserbase.baseUrl;
    return new Browserbase(options);
  }

  private anchorClient() {
    return createAnchorbrowserClient({ baseUrl: this.config.anchor.baseUrl ?? "https://api.anchorbrowser.io", auth: getProviderSecret("anchor") });
  }

  private async runBrowserbase(input: BrowserTaskInput): Promise<unknown> {
    const unsupported = [
      ["url", input.url], ["async", input.async], ["model", input.model], ["providerName", input.providerName],
      ["agent", input.agent], ["maxSteps", input.maxSteps], ["detectElements", input.detectElements],
      ["highlightElements", input.highlightElements], ["humanIntervention", input.humanIntervention],
    ].filter((entry) => entry[1] !== undefined).map((entry) => entry[0]);
    if (unsupported.length) {
      throw new GodmodeError(
        "UNSUPPORTED",
        `Browserbase SDK 2.16.0 Agents/Runs does not support these options: ${unsupported.join(", ")}`,
        { provider: "browserbase", fields: unsupported },
      );
    }
    let contextId: string | undefined;
    if (input.sessionId) {
      const session = this.sessions.get(input.sessionId);
      if (session.provider !== "browserbase") throw new GodmodeError("BAD_INPUT", "sessionId must refer to a Browserbase session");
      contextId = session.persistentRef;
      if (!contextId) throw new GodmodeError("UNSUPPORTED", "Browserbase task sessionId requires a persistent Browserbase context");
    }
    const variables = input.variables
      ? Object.fromEntries(Object.entries(input.variables).map(([key, value]) => [key, {
          value: value.value, ...(value.description !== undefined ? { description: value.description } : {}),
        }]))
      : undefined;
    invariant(input.task, "BAD_INPUT", "task is required for run");
    const result = await this.browserbaseClient().agents.runs.create({
      task: input.task,
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(input.resultSchema ? { resultSchema: input.resultSchema } : {}),
      ...(variables ? { variables } : {}),
      ...(contextId ? { browserSettings: { context: { id: contextId, persist: true } } } : {}),
    });
    return { provider: "browserbase", taskId: result.runId, status: result.status, sessionId: result.sessionId, result: result.result, cause: result.cause };
  }

  private async runAnchor(input: BrowserTaskInput): Promise<unknown> {
    const unsupported = [["agentId", input.agentId], ["variables", input.variables]]
      .filter((entry) => entry[1] !== undefined).map((entry) => entry[0]);
    if (unsupported.length) throw new GodmodeError("UNSUPPORTED", `Anchor tasks do not support these options: ${unsupported.join(", ")}`, { provider: "anchor", fields: unsupported });
    let providerSessionId: string | undefined;
    if (input.sessionId) {
      const session = this.sessions.get(input.sessionId);
      if (session.provider !== "anchor") throw new GodmodeError("BAD_INPUT", "sessionId must refer to an Anchor session");
      providerSessionId = session.providerSessionId;
    }
    invariant(input.task, "BAD_INPUT", "task is required for run");
    const body: PerformWebTaskRequestSchema = { prompt: input.task, async: input.async ?? false };
    if (input.url) body.url = input.url;
    if (input.agent) body.agent = input.agent;
    if (input.providerName) body.provider = input.providerName;
    if (input.model) body.model = input.model;
    if (input.maxSteps) body.max_steps = input.maxSteps;
    if (input.detectElements !== undefined) body.detect_elements = input.detectElements;
    if (input.highlightElements !== undefined) body.highlight_elements = input.highlightElements;
    if (input.humanIntervention !== undefined) body.human_intervention = input.humanIntervention;
    if (input.resultSchema) body.output_schema = input.resultSchema;
    const result = await Tools.performWebTask({ body, ...(providerSessionId ? { query: { sessionId: providerSessionId } } : {}), client: this.anchorClient() });
    const data = result.data;
    invariant(data, "PROVIDER_ERROR", "Anchor returned no task data");
    if ("workflow_id" in data) return { provider: "anchor", taskId: data.workflow_id, status: data.status };
    return { provider: "anchor", status: "COMPLETED", result: data.result };
  }

  private async status(provider: "browserbase" | "anchor", taskId: string): Promise<unknown> {
    if (provider === "browserbase") {
      const result = await this.browserbaseClient().agents.runs.retrieve(taskId);
      return { provider, taskId: result.runId, status: result.status, result: result.result, cause: result.cause, sessionId: result.sessionId };
    }
    const result = await Tools.getPerformWebTaskStatus({ path: { workflowId: taskId }, client: this.anchorClient() });
    return { provider, taskId, ...result.data };
  }
}
