import { asSafeError, GodmodeError } from "./errors.js";
import { redact } from "./redaction.js";
import { TOOL_DEFINITIONS, TOOL_NAMES } from "./runtime.js";
import { PACKAGE_VERSION } from "./version.js";
const SHUTDOWN_TIMEOUT_MS = 5_000;
export async function createMcpServer(runtime) {
    const { McpServer: Server } = await import("@modelcontextprotocol/sdk/server/mcp.js");
    const server = new Server({ name: "linkedin-godmode", version: PACKAGE_VERSION });
    for (const name of TOOL_NAMES) {
        const definition = TOOL_DEFINITIONS[name];
        server.registerTool(name, { description: definition.description, inputSchema: definition.schema }, async (args) => {
            const result = await runtime.safeCall(name, args);
            return {
                content: [{ type: "text", text: JSON.stringify(result.ok ? result.result : result.error) }],
                ...(result.ok ? {} : { isError: true }),
            };
        });
    }
    return server;
}
async function boundedShutdown(work) {
    let timer;
    try {
        await Promise.race([
            work,
            new Promise((_resolve, reject) => {
                timer = setTimeout(() => reject(new GodmodeError("TIMEOUT", `MCP shutdown exceeded ${SHUTDOWN_TIMEOUT_MS}ms`)), SHUTDOWN_TIMEOUT_MS);
            }),
        ]);
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
}
export async function runMcp(runtime) {
    const originalDebug = process.env.DEBUG;
    const originalConsoleLog = console.log;
    delete process.env.DEBUG;
    console.log = (...values) => {
        process.stderr.write(`${values.map((value) => typeof value === "string" ? String(redact(value)) : JSON.stringify(redact(value))).join(" ")}\n`);
    };
    let server;
    let closing;
    let resolveClosed;
    const closed = new Promise((resolve) => { resolveClosed = resolve; });
    const restoreProcessState = () => {
        console.log = originalConsoleLog;
        if (originalDebug === undefined)
            delete process.env.DEBUG;
        else
            process.env.DEBUG = originalDebug;
    };
    const shutdown = () => {
        if (closing)
            return closing;
        closing = boundedShutdown((async () => {
            await runtime.close();
            await server?.close().catch(() => undefined);
        })()).finally(() => {
            restoreProcessState();
            resolveClosed?.();
        });
        return closing;
    };
    const reportShutdownError = (error) => process.stderr.write(`${JSON.stringify(asSafeError(error))}\n`);
    const onInputClose = () => { void shutdown().catch(reportShutdownError); };
    const onSigint = () => { void shutdown().catch(reportShutdownError); };
    const onSigterm = () => { void shutdown().catch(reportShutdownError); };
    const onSighup = () => { void shutdown().catch(reportShutdownError); };
    process.once("SIGINT", onSigint);
    process.once("SIGTERM", onSigterm);
    process.once("SIGHUP", onSighup);
    process.stdin.once("end", onInputClose);
    process.stdin.once("close", onInputClose);
    try {
        const [{ StdioServerTransport }] = await Promise.all([
            import("@modelcontextprotocol/sdk/server/stdio.js"),
        ]);
        server = await createMcpServer(runtime);
        const transport = new StdioServerTransport(process.stdin, process.stdout, { maxBufferSize: 2_000_000 });
        const previousClose = transport.onclose;
        transport.onclose = () => {
            previousClose?.();
            void shutdown().catch(reportShutdownError);
        };
        await server.connect(transport);
        await closed;
        await closing;
    }
    catch (error) {
        await shutdown().catch(() => undefined);
        throw error;
    }
    finally {
        process.off("SIGINT", onSigint);
        process.off("SIGTERM", onSigterm);
        process.off("SIGHUP", onSighup);
        process.stdin.off("end", onInputClose);
        process.stdin.off("close", onInputClose);
        if (!closing)
            await shutdown().catch(() => undefined);
    }
}
