import { redact } from "./redaction.js";

export type ErrorCode =
  | "BAD_INPUT"
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "POLICY_DENIED"
  | "AUTH_REQUIRED"
  | "PROVIDER_ERROR"
  | "UNSUPPORTED"
  | "TIMEOUT"
  | "OUTPUT_TOO_LARGE"
  | "SESSION_CLOSED"
  | "INTERNAL";

export class GodmodeError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown, options?: ErrorOptions) {
    super(message, options);
    this.name = "GodmodeError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function asSafeError(error: unknown): { code: ErrorCode; message: string; details?: unknown } {
  if (error instanceof GodmodeError) {
    const safe: { code: ErrorCode; message: string; details?: unknown } = {
      code: error.code,
      message: String(redact(error.message)),
    };
    if (error.details !== undefined) safe.details = redact(error.details);
    return safe;
  }
  const message = error instanceof Error ? error.message : String(error);
  return { code: "INTERNAL", message: String(redact(message)) };
}

export function invariant(condition: unknown, code: ErrorCode, message: string): asserts condition {
  if (!condition) throw new GodmodeError(code, message);
}
