import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  browserbaseCreate: vi.fn(),
  browserbaseRetrieve: vi.fn(),
  anchorPerform: vi.fn(),
  anchorStatus: vi.fn(),
}));

vi.mock("@browserbasehq/sdk", () => ({
  default: class BrowserbaseMock {
    agents = { runs: { create: mocks.browserbaseCreate, retrieve: mocks.browserbaseRetrieve } };
  },
}));

vi.mock("anchorbrowser", () => ({
  Tools: { performWebTask: mocks.anchorPerform, getPerformWebTaskStatus: mocks.anchorStatus },
  createAnchorbrowserClient: vi.fn(() => ({ mocked: true })),
}));

import { BrowserTasks } from "../../src/tasks.js";
import { tempConfig } from "../helpers.js";

const ORIGINAL = { ...process.env };
beforeEach(() => {
  process.env.BROWSERBASE_API_KEY = "test-browserbase-key";
  process.env.ANCHOR_API_KEY = "test-anchor-key";
  mocks.browserbaseCreate.mockResolvedValue({ runId: "run-1", status: "PENDING" });
  mocks.browserbaseRetrieve.mockResolvedValue({ runId: "run-1", status: "COMPLETED", result: { ok: true } });
  mocks.anchorPerform.mockResolvedValue({ data: { status: "running", workflow_id: "workflow-1" } });
  mocks.anchorStatus.mockResolvedValue({ data: { status: "COMPLETED", result: { ok: true } } });
});
afterEach(() => { process.env = { ...ORIGINAL }; });

describe("provider task request shapes", () => {
  it("uses the official Browserbase Agents/Runs shape", async () => {
    const sessions = { get: () => ({ provider: "browserbase", persistentRef: "context-1" }) };
    const tasks = new BrowserTasks(sessions as never, await tempConfig({ browserbase: { projectId: "project-1" } }));
    const result = await tasks.execute({
      operation: "run",
      provider: "browserbase",
      task: "Return the page title",
      sessionId: "s",
      agentId: "agent-1",
      resultSchema: { type: "object" },
      variables: { target: { value: "https://example.com", description: "target URL" } },
    });
    expect(result).toMatchObject({ provider: "browserbase", taskId: "run-1" });
    expect(mocks.browserbaseCreate).toHaveBeenCalledWith({
      task: "Return the page title",
      agentId: "agent-1",
      resultSchema: { type: "object" },
      variables: { target: { value: "https://example.com", description: "target URL" } },
      browserSettings: { context: { id: "context-1", persist: true } },
    });
  });

  it.each([
    ["model", { model: "custom" }],
    ["url", { url: "https://example.com" }],
    ["async", { async: true }],
    ["providerName", { providerName: "openai" as const }],
  ])("returns typed unsupported for Browserbase %s options", async (_name, option) => {
    const tasks = new BrowserTasks({} as never, await tempConfig());
    await expect(tasks.execute({ operation: "run", provider: "browserbase", task: "x", ...option })).rejects.toMatchObject({ code: "UNSUPPORTED" });
    expect(mocks.browserbaseCreate).not.toHaveBeenCalled();
  });

  it("rejects Browserbase detached session tasks and Anchor-only unsupported fields", async () => {
    const detached = new BrowserTasks({ get: () => ({ provider: "browserbase" }) } as never, await tempConfig());
    await expect(detached.execute({ operation: "run", provider: "browserbase", task: "x", sessionId: "s" })).rejects.toMatchObject({ code: "UNSUPPORTED" });
    const anchor = new BrowserTasks({} as never, await tempConfig());
    await expect(anchor.execute({ operation: "run", provider: "anchor", task: "x", agentId: "browserbase-agent" })).rejects.toMatchObject({ code: "UNSUPPORTED" });
  });

  it("uses Anchor perform-web-task model/config shape and status API", async () => {
    const sessions = { get: () => ({ provider: "anchor", providerSessionId: "anchor-session" }) };
    const tasks = new BrowserTasks(sessions as never, await tempConfig());
    const run = await tasks.execute({
      operation: "run",
      provider: "anchor",
      task: "Return headings",
      sessionId: "s",
      url: "https://example.com",
      async: true,
      agent: "openai-cua",
      providerName: "openai",
      model: "gpt-5.4",
      maxSteps: 12,
      detectElements: true,
      highlightElements: false,
      humanIntervention: true,
      resultSchema: { type: "object" },
    });
    expect(run).toEqual({ provider: "anchor", taskId: "workflow-1", status: "running" });
    expect(mocks.anchorPerform).toHaveBeenCalledWith(expect.objectContaining({
      body: {
        prompt: "Return headings",
        url: "https://example.com",
        async: true,
        agent: "openai-cua",
        provider: "openai",
        model: "gpt-5.4",
        max_steps: 12,
        detect_elements: true,
        highlight_elements: false,
        human_intervention: true,
        output_schema: { type: "object" },
      },
      query: { sessionId: "anchor-session" },
    }));
    await expect(tasks.execute({ operation: "status", provider: "anchor", taskId: "workflow-1" })).resolves.toMatchObject({ provider: "anchor", status: "COMPLETED" });
  });
});
