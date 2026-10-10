import type { Logger, LogMeta } from "./app-context.js";

/**
 * Never throws, even when the logger backend does: every caller is already
 * handling a failure. Kept out of the `context/index.ts` barrel, which reaches
 * the `plumix` façade.
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
