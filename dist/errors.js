import { redact } from "./redaction.js";
export class GodmodeError extends Error {
    code;
    details;
    constructor(code, message, details, options) {
        super(message, options);
        this.name = "GodmodeError";
        this.code = code;
        if (details !== undefined)
            this.details = details;
    }
}
export function asSafeError(error) {
    if (error instanceof GodmodeError) {
        const safe = {
            code: error.code,
            message: String(redact(error.message)),
        };
        if (error.details !== undefined)
            safe.details = redact(error.details);
        return safe;
    }
    const message = error instanceof Error ? error.message : String(error);
    return { code: "INTERNAL", message: String(redact(message)) };
}
export function invariant(condition, code, message) {
    if (!condition)
        throw new GodmodeError(code, message);
}
