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
      const record = { level, message, time: now().toISOString(), ...meta };
      const line = JSON.stringify(record, (_key, value: unknown) =>
        value instanceof Error ? errorFields(value) : value,
      );
      write(`${line}\n`);
    };
  return {
    debug: log("debug"),
    info: log("info"),
    warn: log("warn"),
    error: log("error"),
  };
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
