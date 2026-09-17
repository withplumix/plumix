import type { Logger, LogMeta } from "./app.js";

/**
 * Report `error` as `message`, and let nothing out.
 *
 * A custom logger backend can throw — a broken transport, a full disk, a
 * payload it cannot stringify. Every caller is already handling a failure and
 * holds work it must not lose, so logging one must not start another.
 *
 * Both the error message and the raw value land in the log: the message is the
 * grep-friendly bit, the raw value carries the stack for structured backends.
 *
 * Deliberately outside `context/index.ts`'s barrel — this is core's own
 * plumbing, and the barrel is re-exported all the way to the `plumix` façade.
 */
export function logErrorSafely(
  logger: Logger,
  message: string,
  error: unknown,
  meta?: LogMeta,
): void {
  try {
    // `error` last: it is the field this helper exists to guarantee, so a
    // caller's `meta` must not be able to shadow it.
    logger.error(`${message}: ${errorMessage(error)}`, { ...meta, error });
  } catch {
    // Best-effort: see above.
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
}
