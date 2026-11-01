import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GodmodeRuntime } from "./runtime.js";
export declare function createMcpServer(runtime: GodmodeRuntime): Promise<McpServer>;
export declare function runMcp(runtime: GodmodeRuntime): Promise<void>;
