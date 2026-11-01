import { z } from "zod";
export declare const JsonValueSchema: z.ZodType<unknown>;
export declare const ProviderSchema: z.ZodEnum<{
    anchor: "anchor";
    browserbase: "browserbase";
    local: "local";
}>;
export type ProviderName = z.infer<typeof ProviderSchema>;
export declare const BrowserSessionInputSchema: z.ZodObject<{
    operation: z.ZodEnum<{
        attach: "attach";
        close: "close";
        create: "create";
        list: "list";
        page_close: "page_close";
        page_create: "page_create";
        page_list: "page_list";
        status: "status";
    }>;
    sessionId: z.ZodOptional<z.ZodString>;
    provider: z.ZodOptional<z.ZodEnum<{
        anchor: "anchor";
        browserbase: "browserbase";
        local: "local";
    }>>;
    profile: z.ZodOptional<z.ZodString>;
    providerSessionId: z.ZodOptional<z.ZodString>;
    persistentRef: z.ZodOptional<z.ZodString>;
    headless: z.ZodOptional<z.ZodBoolean>;
    initialUrl: z.ZodOptional<z.ZodString>;
    keepAlive: z.ZodOptional<z.ZodBoolean>;
    timeoutSeconds: z.ZodOptional<z.ZodNumber>;
    terminate: z.ZodOptional<z.ZodBoolean>;
    url: z.ZodOptional<z.ZodString>;
    pageId: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type BrowserSessionInput = z.infer<typeof BrowserSessionInputSchema>;
export declare const BrowserNavigateInputSchema: z.ZodObject<{
    sessionId: z.ZodOptional<z.ZodString>;
    pageId: z.ZodOptional<z.ZodString>;
    operation: z.ZodEnum<{
        back: "back";
        forward: "forward";
        goto: "goto";
        reload: "reload";
    }>;
    url: z.ZodOptional<z.ZodString>;
    waitUntil: z.ZodOptional<z.ZodEnum<{
        commit: "commit";
        domcontentloaded: "domcontentloaded";
        load: "load";
        networkidle: "networkidle";
    }>>;
    timeoutMs: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
export type BrowserNavigateInput = z.infer<typeof BrowserNavigateInputSchema>;
export declare const LocatorSchema: z.ZodObject<{
    kind: z.ZodEnum<{
        css: "css";
        label: "label";
        placeholder: "placeholder";
        role: "role";
        testid: "testid";
        text: "text";
        xpath: "xpath";
    }>;
    value: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    exact: z.ZodOptional<z.ZodBoolean>;
    index: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
export declare const BrowserActInputSchema: z.ZodObject<{
    sessionId: z.ZodOptional<z.ZodString>;
    pageId: z.ZodOptional<z.ZodString>;
    locator: z.ZodObject<{
        kind: z.ZodEnum<{
            css: "css";
            label: "label";
            placeholder: "placeholder";
            role: "role";
            testid: "testid";
            text: "text";
            xpath: "xpath";
        }>;
        value: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        exact: z.ZodOptional<z.ZodBoolean>;
        index: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strict>;
    action: z.ZodEnum<{
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
    value: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    timeoutMs: z.ZodOptional<z.ZodNumber>;
    force: z.ZodOptional<z.ZodBoolean>;
    noWaitAfter: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strict>;
export type BrowserActInput = z.infer<typeof BrowserActInputSchema>;
export declare const BrowserEvaluateInputSchema: z.ZodObject<{
    sessionId: z.ZodOptional<z.ZodString>;
    pageId: z.ZodOptional<z.ZodString>;
    source: z.ZodString;
    arg: z.ZodOptional<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>;
}, z.core.$strict>;
export type BrowserEvaluateInput = z.infer<typeof BrowserEvaluateInputSchema>;
export declare const BrowserCaptureInputSchema: z.ZodObject<{
    sessionId: z.ZodOptional<z.ZodString>;
    pageId: z.ZodOptional<z.ZodString>;
    format: z.ZodEnum<{
        accessibility: "accessibility";
        html: "html";
        screenshot: "screenshot";
        text: "text";
    }>;
    fullPage: z.ZodOptional<z.ZodBoolean>;
    selector: z.ZodOptional<z.ZodObject<{
        kind: z.ZodEnum<{
            css: "css";
            label: "label";
            placeholder: "placeholder";
            role: "role";
            testid: "testid";
            text: "text";
            xpath: "xpath";
        }>;
        value: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        exact: z.ZodOptional<z.ZodBoolean>;
        index: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strict>>;
    maxBytes: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
export type BrowserCaptureInput = z.infer<typeof BrowserCaptureInputSchema>;
export declare const BrowserNetworkInputSchema: z.ZodObject<{
    operation: z.ZodEnum<{
        clear: "clear";
        read: "read";
        start: "start";
        stop: "stop";
    }>;
    sessionId: z.ZodOptional<z.ZodString>;
    pageId: z.ZodOptional<z.ZodString>;
    includeBodies: z.ZodOptional<z.ZodBoolean>;
    maxEntries: z.ZodOptional<z.ZodNumber>;
    maxBodyBytes: z.ZodOptional<z.ZodNumber>;
    maxTotalBytes: z.ZodOptional<z.ZodNumber>;
    maxPendingTasks: z.ZodOptional<z.ZodNumber>;
    clear: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strict>;
export type BrowserNetworkInput = z.infer<typeof BrowserNetworkInputSchema>;
export declare const HttpRequestInputSchema: z.ZodObject<{
    url: z.ZodString;
    method: z.ZodOptional<z.ZodString>;
    headers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    body: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"json">;
        value: z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"text">;
        value: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"base64">;
        value: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"form">;
        fields: z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>, z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>>]>>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"multipart">;
        fields: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>, z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>>]>>>;
        files: z.ZodOptional<z.ZodArray<z.ZodObject<{
            field: z.ZodString;
            filename: z.ZodString;
            contentType: z.ZodOptional<z.ZodString>;
            dataBase64: z.ZodString;
        }, z.core.$strict>>>;
    }, z.core.$strict>], "type">>;
    responseType: z.ZodOptional<z.ZodEnum<{
        auto: "auto";
        base64: "base64";
        json: "json";
        none: "none";
        text: "text";
    }>>;
    timeoutMs: z.ZodOptional<z.ZodNumber>;
    maxResponseBytes: z.ZodOptional<z.ZodNumber>;
    sessionId: z.ZodOptional<z.ZodString>;
    linkedinWebPreset: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strict>;
export type HttpRequestInput = z.infer<typeof HttpRequestInputSchema>;
export declare const AnchorAgentSchema: z.ZodEnum<{
    "anthropic-cua": "anthropic-cua";
    "browser-use": "browser-use";
    "gemini-computer-use": "gemini-computer-use";
    "openai-cua": "openai-cua";
    yutori: "yutori";
}>;
export declare const AnchorProviderNameSchema: z.ZodEnum<{
    azure: "azure";
    gemini: "gemini";
    groq: "groq";
    openai: "openai";
    xai: "xai";
}>;
export declare const BrowserTaskInputSchema: z.ZodObject<{
    operation: z.ZodEnum<{
        run: "run";
        status: "status";
    }>;
    provider: z.ZodEnum<{
        anchor: "anchor";
        browserbase: "browserbase";
    }>;
    task: z.ZodOptional<z.ZodString>;
    taskId: z.ZodOptional<z.ZodString>;
    sessionId: z.ZodOptional<z.ZodString>;
    url: z.ZodOptional<z.ZodString>;
    async: z.ZodOptional<z.ZodBoolean>;
    resultSchema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>>;
    agentId: z.ZodOptional<z.ZodString>;
    agent: z.ZodOptional<z.ZodEnum<{
        "anthropic-cua": "anthropic-cua";
        "browser-use": "browser-use";
        "gemini-computer-use": "gemini-computer-use";
        "openai-cua": "openai-cua";
        yutori: "yutori";
    }>>;
    providerName: z.ZodOptional<z.ZodEnum<{
        azure: "azure";
        gemini: "gemini";
        groq: "groq";
        openai: "openai";
        xai: "xai";
    }>>;
    model: z.ZodOptional<z.ZodString>;
    maxSteps: z.ZodOptional<z.ZodNumber>;
    detectElements: z.ZodOptional<z.ZodBoolean>;
    highlightElements: z.ZodOptional<z.ZodBoolean>;
    humanIntervention: z.ZodOptional<z.ZodBoolean>;
    variables: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        value: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>>;
}, z.core.$strict>;
export type BrowserTaskInput = z.infer<typeof BrowserTaskInputSchema>;
export declare const DoctorInputSchema: z.ZodObject<{
    verbose: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strict>;
export declare const BatchCommandSchema: z.ZodObject<{
    id: z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>;
    tool: z.ZodString;
    arguments: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>>;
}, z.core.$strict>;
export type BatchCommand = z.infer<typeof BatchCommandSchema>;
