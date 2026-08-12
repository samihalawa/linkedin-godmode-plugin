import { z } from "zod";

export const JsonValueSchema: z.ZodType<unknown> = z.unknown();
export const ProviderSchema = z.enum(["local", "browserbase", "anchor"]);
export type ProviderName = z.infer<typeof ProviderSchema>;

function rejectFields(
  value: Record<string, unknown>,
  context: z.RefinementCtx,
  allowed: ReadonlySet<string>,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) context.addIssue({ code: "custom", message: `${key} is not valid for ${String(value.operation)}`, path: [key] });
  }
}

const sessionFields = {
  operation: z.enum(["create", "attach", "list", "status", "close", "page_create", "page_list", "page_close"]),
  sessionId: z.string().min(1).max(128).optional(),
  provider: ProviderSchema.optional(),
  profile: z.string().min(1).max(128).optional(),
  providerSessionId: z.string().min(1).max(256).optional(),
  persistentRef: z.string().min(1).max(256).optional(),
  headless: z.boolean().optional(),
  initialUrl: z.string().url().optional(),
  keepAlive: z.boolean().optional(),
  timeoutSeconds: z.number().int().positive().max(21600).optional(),
  terminate: z.boolean().optional(),
  url: z.string().url().optional(),
  pageId: z.string().min(1).optional(),
};

const SESSION_ALLOWED: Record<string, ReadonlySet<string>> = {
  create: new Set(["operation", "sessionId", "provider", "profile", "providerSessionId", "persistentRef", "headless", "initialUrl", "keepAlive", "timeoutSeconds"]),
  attach: new Set(["operation", "sessionId", "provider", "profile", "providerSessionId", "persistentRef", "headless"]),
  list: new Set(["operation"]),
  status: new Set(["operation", "sessionId"]),
  close: new Set(["operation", "sessionId", "terminate"]),
  page_create: new Set(["operation", "sessionId", "url"]),
  page_list: new Set(["operation", "sessionId"]),
  page_close: new Set(["operation", "sessionId", "pageId"]),
};

export const BrowserSessionInputSchema = z.object(sessionFields).strict().superRefine((value, context) => {
  rejectFields(value, context, SESSION_ALLOWED[value.operation]!);
  if (value.operation === "attach" && !value.provider) context.addIssue({ code: "custom", message: "provider is required for attach", path: ["provider"] });
  if (value.operation === "page_close" && !value.pageId) context.addIssue({ code: "custom", message: "pageId is required for page_close", path: ["pageId"] });
});
export type BrowserSessionInput = z.infer<typeof BrowserSessionInputSchema>;

export const BrowserNavigateInputSchema = z.object({
  sessionId: z.string().min(1).optional(),
  pageId: z.string().min(1).optional(),
  operation: z.enum(["goto", "back", "forward", "reload"]),
  url: z.string().url().optional(),
  waitUntil: z.enum(["load", "domcontentloaded", "networkidle", "commit"]).optional(),
  timeoutMs: z.number().int().positive().max(300000).optional(),
}).strict().superRefine((value, context) => {
  if (value.operation === "goto" && !value.url) context.addIssue({ code: "custom", message: "url is required for goto", path: ["url"] });
  if (value.operation !== "goto" && value.url !== undefined) context.addIssue({ code: "custom", message: `url is not valid for ${value.operation}`, path: ["url"] });
});
export type BrowserNavigateInput = z.infer<typeof BrowserNavigateInputSchema>;

export const LocatorSchema = z.object({
  kind: z.enum(["css", "role", "text", "label", "placeholder", "testid", "xpath"]),
  value: z.string().min(1).max(4096),
  name: z.string().max(1024).optional(),
  exact: z.boolean().optional(),
  index: z.number().int().nonnegative().optional(),
}).strict();

export const BrowserActInputSchema = z.object({
  sessionId: z.string().min(1).optional(),
  pageId: z.string().min(1).optional(),
  locator: LocatorSchema,
  action: z.enum(["click", "dblclick", "fill", "type", "press", "check", "uncheck", "select", "hover", "focus", "wait"]),
  value: z.union([z.string(), z.array(z.string())]).optional(),
  timeoutMs: z.number().int().positive().max(300000).optional(),
  force: z.boolean().optional(),
  noWaitAfter: z.boolean().optional(),
}).strict();
export type BrowserActInput = z.infer<typeof BrowserActInputSchema>;

export const BrowserEvaluateInputSchema = z.object({
  sessionId: z.string().min(1).optional(),
  pageId: z.string().min(1).optional(),
  source: z.string().min(1).max(100000),
  arg: JsonValueSchema.optional(),
}).strict();
export type BrowserEvaluateInput = z.infer<typeof BrowserEvaluateInputSchema>;

export const BrowserCaptureInputSchema = z.object({
  sessionId: z.string().min(1).optional(),
  pageId: z.string().min(1).optional(),
  format: z.enum(["screenshot", "html", "accessibility", "text"]),
  fullPage: z.boolean().optional(),
  selector: LocatorSchema.optional(),
  maxBytes: z.number().int().positive().max(10_000_000).optional(),
}).strict();
export type BrowserCaptureInput = z.infer<typeof BrowserCaptureInputSchema>;

const networkFields = {
  operation: z.enum(["start", "read", "clear", "stop"]),
  sessionId: z.string().min(1).optional(),
  pageId: z.string().min(1).optional(),
  includeBodies: z.boolean().optional(),
  maxEntries: z.number().int().positive().max(5000).optional(),
  maxBodyBytes: z.number().int().positive().max(2_000_000).optional(),
  maxTotalBytes: z.number().int().positive().max(10_000_000).optional(),
  maxPendingTasks: z.number().int().positive().max(256).optional(),
  clear: z.boolean().optional(),
};
export const BrowserNetworkInputSchema = z.object(networkFields).strict().superRefine((value, context) => {
  const common = ["operation", "sessionId", "pageId"];
  const allowed = value.operation === "start"
    ? new Set([...common, "includeBodies", "maxEntries", "maxBodyBytes", "maxTotalBytes", "maxPendingTasks"])
    : value.operation === "read" ? new Set([...common, "clear"]) : new Set(common);
  rejectFields(value, context, allowed);
});
export type BrowserNetworkInput = z.infer<typeof BrowserNetworkInputSchema>;

const ScalarFormValue = z.union([z.string(), z.number(), z.boolean()]);
const HttpBodySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("json"), value: JsonValueSchema }).strict(),
  z.object({ type: z.literal("text"), value: z.string() }).strict(),
  z.object({ type: z.literal("base64"), value: z.string() }).strict(),
  z.object({ type: z.literal("form"), fields: z.record(z.string(), z.union([ScalarFormValue, z.array(ScalarFormValue)])) }).strict(),
  z.object({
    type: z.literal("multipart"),
    fields: z.record(z.string(), z.union([ScalarFormValue, z.array(ScalarFormValue)])).optional(),
    files: z.array(z.object({
      field: z.string().min(1),
      filename: z.string().min(1),
      contentType: z.string().min(1).optional(),
      dataBase64: z.string(),
    }).strict()).optional(),
  }).strict().superRefine((value, context) => {
    if (!value.fields && !value.files?.length) context.addIssue({ code: "custom", message: "multipart requires fields or files" });
  }),
]);

export const HttpRequestInputSchema = z.object({
  url: z.string().url(),
  method: z.string().regex(/^[A-Z0-9!#$%&'*+.^_`|~-]+$/, "method must be an uppercase HTTP token").optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body: HttpBodySchema.optional(),
  responseType: z.enum(["auto", "json", "text", "base64", "none"]).optional(),
  timeoutMs: z.number().int().positive().max(300000).optional(),
  maxResponseBytes: z.number().int().positive().max(10_000_000).optional(),
  sessionId: z.string().min(1).optional(),
  linkedinWebPreset: z.boolean().optional(),
}).strict().superRefine((value, context) => {
  if ((value.method === "GET" || value.method === "HEAD") && value.body !== undefined) {
    context.addIssue({ code: "custom", message: `${value.method} requests cannot include a body`, path: ["body"] });
  }
});
export type HttpRequestInput = z.infer<typeof HttpRequestInputSchema>;

export const AnchorAgentSchema = z.enum(["browser-use", "openai-cua", "gemini-computer-use", "anthropic-cua", "yutori"]);
export const AnchorProviderNameSchema = z.enum(["openai", "gemini", "groq", "azure", "xai"]);

const taskFields = {
  operation: z.enum(["run", "status"]),
  provider: z.enum(["browserbase", "anchor"]),
  task: z.string().min(1).max(20000).optional(),
  taskId: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),
  url: z.string().url().optional(),
  async: z.boolean().optional(),
  resultSchema: z.record(z.string(), JsonValueSchema).optional(),
  agentId: z.string().min(1).optional(),
  agent: AnchorAgentSchema.optional(),
  providerName: AnchorProviderNameSchema.optional(),
  model: z.string().min(1).max(256).optional(),
  maxSteps: z.number().int().positive().max(1000).optional(),
  detectElements: z.boolean().optional(),
  highlightElements: z.boolean().optional(),
  humanIntervention: z.boolean().optional(),
  variables: z.record(z.string(), z.object({ value: z.string(), description: z.string().optional() }).strict()).optional(),
};
export const BrowserTaskInputSchema = z.object(taskFields).strict().superRefine((value, context) => {
  if (value.operation === "status") {
    rejectFields(value, context, new Set(["operation", "provider", "taskId"]));
    if (!value.taskId) context.addIssue({ code: "custom", message: "taskId is required for status", path: ["taskId"] });
    return;
  }
  if (!value.task) context.addIssue({ code: "custom", message: "task is required for run", path: ["task"] });
});
export type BrowserTaskInput = z.infer<typeof BrowserTaskInputSchema>;

export const DoctorInputSchema = z.object({ verbose: z.boolean().optional() }).strict();

export const BatchCommandSchema = z.object({
  id: z.union([z.string(), z.number()]),
  tool: z.string().min(1),
  arguments: z.record(z.string(), JsonValueSchema).default({}),
}).strict();
export type BatchCommand = z.infer<typeof BatchCommandSchema>;
