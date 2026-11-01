export declare const REDACTED = "[REDACTED]";
export declare function containsSensitiveKey(key: string): boolean;
export declare function redactString(value: string): string;
export declare function redact(value: unknown, maxDepth?: number): unknown;
export declare function safeHeaders(headers: Record<string, string>): Record<string, string>;
