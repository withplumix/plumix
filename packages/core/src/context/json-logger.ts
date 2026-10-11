import type { Logger, LogMeta } from "./app-context.js";

type Level = keyof Logger;

/**
 * A logger for a log drain: each call is written as one JSON object ending in
 * a newline, so a collector splits the stream on newlines alone.
 */
export function createJsonLogger(
  write: (line: string) => void,
  now: () => Date = () => new Date(),
): Logger {
  const log =
    (level: Level) =>
    (message: string, meta?: LogMeta): void => {
      const head = { level, message, time: now().toISOString() };
      write(`${serialize({ ...head, ...meta, ...head })}\n`);
    };
  return {
    debug: log("debug"),
    info: log("info"),
    warn: log("warn"),
    error: log("error"),
  };
}

/** A log call must never throw, so meta JSON cannot hold is dropped, and says why. */
function serialize(record: Record<string, unknown>): string {
  try {
    return JSON.stringify(record, (_key, value: unknown) =>
      value instanceof Error ? errorFields(value) : value,
    );
  } catch (cause) {
    const { level, message, time } = record;
    return JSON.stringify({
      level,
      message,
      time,
      unserializable: cause instanceof Error ? cause.message : String(cause),
    });
  }
}

interface ErrorFields {
  readonly name: string;
  readonly message: string;
  readonly stack: string | undefined;
}

/** An `Error`'s own fields are non-enumerable, so it would print as `{}`. */
function errorFields(error: Error): ErrorFields {
  return { name: error.name, message: error.message, stack: error.stack };
}
