import type { Logger, LogMeta } from "../context/app-context.js";

type LogLevel = keyof Logger;

/** One line the site wrote through `ctx.logger`. */
export interface LoggedLine {
  readonly level: LogLevel;
  readonly message: string;
  readonly meta: LogMeta | undefined;
}

/**
 * Records what the site wrote through `ctx.logger`, and prints none of it.
 * Each assertion throws a plain `Error` listing the lines actually logged.
 */
export interface LoggerFake extends Logger {
  /** Throws unless a line with exactly this message was logged at `level`. */
  readonly assertLogged: (level: LogLevel, message: string) => void;
  readonly assertNothingLogged: (level: LogLevel) => void;
  readonly lines: readonly LoggedLine[];
}

export function fakeLogger(): LoggerFake {
  const lines: LoggedLine[] = [];
  const at =
    (level: LogLevel) =>
    (message: string, meta?: LogMeta): void => {
      lines.push({ level, message, meta });
    };

  function fail(expectation: string): never {
    throw new Error(`${expectation}\n${describeLines(lines)}`);
  }

  return {
    debug: at("debug"),
    info: at("info"),
    warn: at("warn"),
    error: at("error"),
    lines,
    assertLogged: (level, message) => {
      if (lines.some((l) => l.level === level && l.message === message)) {
        return;
      }
      fail(`Expected "${message}" to be logged at ${level}, but it was not.`);
    },
    assertNothingLogged: (level) => {
      const count = lines.filter((l) => l.level === level).length;
      if (count === 0) return;
      fail(
        `Expected nothing to be logged at ${level}, but ${String(count)} ${count === 1 ? "line was" : "lines were"}.`,
      );
    },
  };
}

function describeLines(lines: readonly LoggedLine[]): string {
  if (lines.length === 0) return "Logged: nothing.";
  return `Logged:\n${lines.map((l) => `  ${l.level}: ${l.message}`).join("\n")}`;
}
