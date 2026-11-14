import type { Logger, LogMeta } from "./app-context.js";
import { now as currentTime } from "../clock.js";
import { loggableError } from "./log-meta.js";

type Level = keyof Logger;

interface LogRecordHead {
  readonly level: Level;
  readonly message: string;
  readonly time: string;
}

/**
 * A logger for a log drain: each call is written as one JSON object ending in
 * a newline, so a collector splits the stream on newlines alone.
 */
export function createJsonLogger(
  write: (line: string) => void,
  now: () => Date = () => currentTime(),
): Logger {
  const log =
    (level: Level) =>
    (message: string, meta?: LogMeta): void => {
      const head: LogRecordHead = {
        level,
        message,
        time: now().toISOString(),
      };
      write(`${serialize(head, meta)}\n`);
    };
  return {
    debug: log("debug"),
    info: log("info"),
    warn: log("warn"),
    error: log("error"),
  };
}

/** A log call must never throw, so meta JSON cannot hold is dropped, and says why. */
function serialize(head: LogRecordHead, meta: LogMeta = {}): string {
  try {
    return JSON.stringify(
      { ...head, ...meta, ...head },
      (_key, value: unknown) =>
        value instanceof Error ? loggableError(value) : value,
    );
  } catch (cause) {
    return JSON.stringify({
      ...head,
      unserializable: cause instanceof Error ? cause.message : String(cause),
    });
  }
}
