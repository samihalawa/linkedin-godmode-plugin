export type ErrorCode = "BAD_INPUT" | "NOT_FOUND" | "ALREADY_EXISTS" | "POLICY_DENIED" | "AUTH_REQUIRED" | "PROVIDER_ERROR" | "UNSUPPORTED" | "TIMEOUT" | "OUTPUT_TOO_LARGE" | "SESSION_CLOSED" | "INTERNAL";
export declare class GodmodeError extends Error {
    readonly code: ErrorCode;
    readonly details?: unknown;
    constructor(code: ErrorCode, message: string, details?: unknown, options?: ErrorOptions);
}
export declare function asSafeError(error: unknown): {
    code: ErrorCode;
    message: string;
    details?: unknown;
};
export declare function invariant(condition: unknown, code: ErrorCode, message: string): asserts condition;
