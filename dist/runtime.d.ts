import { BrowserOperations } from "./browser.js";
import { type RuntimeConfig } from "./config.js";
import { asSafeError } from "./errors.js";
import { HttpOperations } from "./http.js";
import { NetworkCapture } from "./network.js";
import { SessionManager } from "./sessions.js";
import { BrowserTasks } from "./tasks.js";
export declare const TOOL_DEFINITIONS: {
    readonly browser_session: {
        readonly description: "Create, attach, list, inspect, or close generic browser sessions and pages.";
        readonly schema: import("zod").ZodObject<{
            operation: import("zod").ZodEnum<{
                attach: "attach";
                close: "close";
                create: "create";
                list: "list";
                page_close: "page_close";
                page_create: "page_create";
                page_list: "page_list";
                status: "status";
            }>;
            sessionId: import("zod").ZodOptional<import("zod").ZodString>;
            provider: import("zod").ZodOptional<import("zod").ZodEnum<{
                anchor: "anchor";
                browserbase: "browserbase";
                local: "local";
            }>>;
            profile: import("zod").ZodOptional<import("zod").ZodString>;
            providerSessionId: import("zod").ZodOptional<import("zod").ZodString>;
            persistentRef: import("zod").ZodOptional<import("zod").ZodString>;
            headless: import("zod").ZodOptional<import("zod").ZodBoolean>;
            initialUrl: import("zod").ZodOptional<import("zod").ZodString>;
            keepAlive: import("zod").ZodOptional<import("zod").ZodBoolean>;
            timeoutSeconds: import("zod").ZodOptional<import("zod").ZodNumber>;
            terminate: import("zod").ZodOptional<import("zod").ZodBoolean>;
            url: import("zod").ZodOptional<import("zod").ZodString>;
            pageId: import("zod").ZodOptional<import("zod").ZodString>;
        }, import("zod/v4/core").$strict>;
    };
    readonly http_request: {
        readonly description: "Make a bounded generic HTTP request, optionally sharing a browser session cookie jar in memory.";
        readonly schema: import("zod").ZodObject<{
            url: import("zod").ZodString;
            method: import("zod").ZodOptional<import("zod").ZodString>;
            headers: import("zod").ZodOptional<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodString>>;
            body: import("zod").ZodOptional<import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
                type: import("zod").ZodLiteral<"json">;
                value: import("zod").ZodType<unknown, unknown, import("zod/v4/core").$ZodTypeInternals<unknown, unknown>>;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                type: import("zod").ZodLiteral<"text">;
                value: import("zod").ZodString;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                type: import("zod").ZodLiteral<"base64">;
                value: import("zod").ZodString;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                type: import("zod").ZodLiteral<"form">;
                fields: import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodUnion<readonly [import("zod").ZodUnion<readonly [import("zod").ZodString, import("zod").ZodNumber, import("zod").ZodBoolean]>, import("zod").ZodArray<import("zod").ZodUnion<readonly [import("zod").ZodString, import("zod").ZodNumber, import("zod").ZodBoolean]>>]>>;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                type: import("zod").ZodLiteral<"multipart">;
                fields: import("zod").ZodOptional<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodUnion<readonly [import("zod").ZodUnion<readonly [import("zod").ZodString, import("zod").ZodNumber, import("zod").ZodBoolean]>, import("zod").ZodArray<import("zod").ZodUnion<readonly [import("zod").ZodString, import("zod").ZodNumber, import("zod").ZodBoolean]>>]>>>;
                files: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    filename: import("zod").ZodString;
                    contentType: import("zod").ZodOptional<import("zod").ZodString>;
                    dataBase64: import("zod").ZodString;
                }, import("zod/v4/core").$strict>>>;
            }, import("zod/v4/core").$strict>], "type">>;
            responseType: import("zod").ZodOptional<import("zod").ZodEnum<{
                auto: "auto";
                base64: "base64";
                json: "json";
                none: "none";
                text: "text";
            }>>;
            timeoutMs: import("zod").ZodOptional<import("zod").ZodNumber>;
            maxResponseBytes: import("zod").ZodOptional<import("zod").ZodNumber>;
            sessionId: import("zod").ZodOptional<import("zod").ZodString>;
            linkedinWebPreset: import("zod").ZodOptional<import("zod").ZodBoolean>;
        }, import("zod/v4/core").$strict>;
    };
    readonly browser_navigate: {
        readonly description: "Navigate a browser page with goto, back, forward, or reload.";
        readonly schema: import("zod").ZodObject<{
            sessionId: import("zod").ZodOptional<import("zod").ZodString>;
            pageId: import("zod").ZodOptional<import("zod").ZodString>;
            operation: import("zod").ZodEnum<{
                back: "back";
                forward: "forward";
                goto: "goto";
                reload: "reload";
            }>;
            url: import("zod").ZodOptional<import("zod").ZodString>;
            waitUntil: import("zod").ZodOptional<import("zod").ZodEnum<{
                commit: "commit";
                domcontentloaded: "domcontentloaded";
                load: "load";
                networkidle: "networkidle";
            }>>;
            timeoutMs: import("zod").ZodOptional<import("zod").ZodNumber>;
        }, import("zod/v4/core").$strict>;
    };
    readonly browser_act: {
        readonly description: "Perform a generic locator action using CSS, role, text, label, placeholder, test ID, or XPath.";
        readonly schema: import("zod").ZodObject<{
            sessionId: import("zod").ZodOptional<import("zod").ZodString>;
            pageId: import("zod").ZodOptional<import("zod").ZodString>;
            locator: import("zod").ZodObject<{
                kind: import("zod").ZodEnum<{
                    css: "css";
                    label: "label";
                    placeholder: "placeholder";
                    role: "role";
                    testid: "testid";
                    text: "text";
                    xpath: "xpath";
                }>;
                value: import("zod").ZodString;
                name: import("zod").ZodOptional<import("zod").ZodString>;
                exact: import("zod").ZodOptional<import("zod").ZodBoolean>;
                index: import("zod").ZodOptional<import("zod").ZodNumber>;
            }, import("zod/v4/core").$strict>;
            action: import("zod").ZodEnum<{
                check: "check";
                click: "click";
                dblclick: "dblclick";
                fill: "fill";
                focus: "focus";
                hover: "hover";
                press: "press";
                select: "select";
                type: "type";
                uncheck: "uncheck";
                wait: "wait";
            }>;
            value: import("zod").ZodOptional<import("zod").ZodUnion<readonly [import("zod").ZodString, import("zod").ZodArray<import("zod").ZodString>]>>;
            timeoutMs: import("zod").ZodOptional<import("zod").ZodNumber>;
            force: import("zod").ZodOptional<import("zod").ZodBoolean>;
            noWaitAfter: import("zod").ZodOptional<import("zod").ZodBoolean>;
        }, import("zod/v4/core").$strict>;
    };
    readonly browser_evaluate: {
        readonly description: "Explicitly evaluate caller-provided JavaScript in a browser page with a JSON argument.";
        readonly schema: import("zod").ZodObject<{
            sessionId: import("zod").ZodOptional<import("zod").ZodString>;
            pageId: import("zod").ZodOptional<import("zod").ZodString>;
            source: import("zod").ZodString;
            arg: import("zod").ZodOptional<import("zod").ZodType<unknown, unknown, import("zod/v4/core").$ZodTypeInternals<unknown, unknown>>>;
        }, import("zod/v4/core").$strict>;
    };
    readonly browser_capture: {
        readonly description: "Capture a bounded screenshot, HTML, accessibility snapshot, or visible text.";
        readonly schema: import("zod").ZodObject<{
            sessionId: import("zod").ZodOptional<import("zod").ZodString>;
            pageId: import("zod").ZodOptional<import("zod").ZodString>;
            format: import("zod").ZodEnum<{
                accessibility: "accessibility";
                html: "html";
                screenshot: "screenshot";
                text: "text";
            }>;
            fullPage: import("zod").ZodOptional<import("zod").ZodBoolean>;
            selector: import("zod").ZodOptional<import("zod").ZodObject<{
                kind: import("zod").ZodEnum<{
                    css: "css";
                    label: "label";
                    placeholder: "placeholder";
                    role: "role";
                    testid: "testid";
                    text: "text";
                    xpath: "xpath";
                }>;
                value: import("zod").ZodString;
                name: import("zod").ZodOptional<import("zod").ZodString>;
                exact: import("zod").ZodOptional<import("zod").ZodBoolean>;
                index: import("zod").ZodOptional<import("zod").ZodNumber>;
            }, import("zod/v4/core").$strict>>;
            maxBytes: import("zod").ZodOptional<import("zod").ZodNumber>;
        }, import("zod/v4/core").$strict>;
    };
    readonly browser_network: {
        readonly description: "Start, read, clear, or stop bounded generic page network capture; bodies require explicit opt-in.";
        readonly schema: import("zod").ZodObject<{
            operation: import("zod").ZodEnum<{
                clear: "clear";
                read: "read";
                start: "start";
                stop: "stop";
            }>;
            sessionId: import("zod").ZodOptional<import("zod").ZodString>;
            pageId: import("zod").ZodOptional<import("zod").ZodString>;
            includeBodies: import("zod").ZodOptional<import("zod").ZodBoolean>;
            maxEntries: import("zod").ZodOptional<import("zod").ZodNumber>;
            maxBodyBytes: import("zod").ZodOptional<import("zod").ZodNumber>;
            maxTotalBytes: import("zod").ZodOptional<import("zod").ZodNumber>;
            maxPendingTasks: import("zod").ZodOptional<import("zod").ZodNumber>;
            clear: import("zod").ZodOptional<import("zod").ZodBoolean>;
        }, import("zod/v4/core").$strict>;
    };
    readonly browser_task: {
        readonly description: "Explicitly invoke an Anchor or Browserbase hosted browser task; never invoked by other tools.";
        readonly schema: import("zod").ZodObject<{
            operation: import("zod").ZodEnum<{
                run: "run";
                status: "status";
            }>;
            provider: import("zod").ZodEnum<{
                anchor: "anchor";
                browserbase: "browserbase";
            }>;
            task: import("zod").ZodOptional<import("zod").ZodString>;
            taskId: import("zod").ZodOptional<import("zod").ZodString>;
            sessionId: import("zod").ZodOptional<import("zod").ZodString>;
            url: import("zod").ZodOptional<import("zod").ZodString>;
            async: import("zod").ZodOptional<import("zod").ZodBoolean>;
            resultSchema: import("zod").ZodOptional<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodType<unknown, unknown, import("zod/v4/core").$ZodTypeInternals<unknown, unknown>>>>;
            agentId: import("zod").ZodOptional<import("zod").ZodString>;
            agent: import("zod").ZodOptional<import("zod").ZodEnum<{
                "anthropic-cua": "anthropic-cua";
                "browser-use": "browser-use";
                "gemini-computer-use": "gemini-computer-use";
                "openai-cua": "openai-cua";
                yutori: "yutori";
            }>>;
            providerName: import("zod").ZodOptional<import("zod").ZodEnum<{
                azure: "azure";
                gemini: "gemini";
                groq: "groq";
                openai: "openai";
                xai: "xai";
            }>>;
            model: import("zod").ZodOptional<import("zod").ZodString>;
            maxSteps: import("zod").ZodOptional<import("zod").ZodNumber>;
            detectElements: import("zod").ZodOptional<import("zod").ZodBoolean>;
            highlightElements: import("zod").ZodOptional<import("zod").ZodBoolean>;
            humanIntervention: import("zod").ZodOptional<import("zod").ZodBoolean>;
            variables: import("zod").ZodOptional<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodObject<{
                value: import("zod").ZodString;
                description: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strict>>>;
        }, import("zod/v4/core").$strict>;
    };
    readonly doctor: {
        readonly description: "Report local runtime, configuration, and provider readiness without exposing secrets.";
        readonly schema: import("zod").ZodObject<{
            verbose: import("zod").ZodOptional<import("zod").ZodBoolean>;
        }, import("zod/v4/core").$strict>;
    };
};
export type ToolName = keyof typeof TOOL_DEFINITIONS;
export declare const TOOL_NAMES: ToolName[];
export declare class GodmodeRuntime {
    readonly config: RuntimeConfig;
    readonly sessions: SessionManager;
    readonly browser: BrowserOperations;
    readonly network: NetworkCapture;
    readonly http: HttpOperations;
    readonly tasks: BrowserTasks;
    constructor(config: RuntimeConfig);
    call(tool: string, input: unknown): Promise<unknown>;
    doctor(): Promise<unknown>;
    safeCall(tool: string, input: unknown): Promise<{
        ok: true;
        result: unknown;
    } | {
        ok: false;
        error: ReturnType<typeof asSafeError>;
    }>;
    close(): Promise<void>;
}
export declare function createRuntime(configFile?: string): Promise<GodmodeRuntime>;
