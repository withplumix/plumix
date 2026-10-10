/**
 * The codes core throws itself. Every other package declares its own union on
 * a subclass, so core carries no command's or runtime's vocabulary.
 */
type CoreCliErrorCode = "spawn_failed" | "spawn_nonzero_exit";

export class CliError<Code extends string = string> extends Error {
  static {
    CliError.prototype.name = "CliError";
  }

  readonly code: Code;
  readonly hint: string | undefined;

  protected constructor(
    code: Code,
    message: string,
    hint: string | undefined,
    cause: unknown,
  ) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.code = code;
    this.hint = hint;
  }

  static spawnFailed(ctx: {
    command: string;
    cause: unknown;
  }): CliError<CoreCliErrorCode> {
    return new CliError(
      "spawn_failed",
      `Failed to start ${ctx.command}`,
      `Is ${ctx.command} installed and on PATH?`,
      ctx.cause,
    );
  }

  static spawnNonzeroExit(ctx: {
    command: string;
    exitCode: number | null;
    signal: NodeJS.Signals | null;
  }): CliError<CoreCliErrorCode> {
    const detail = ctx.signal
      ? `signal ${ctx.signal}`
      : `code ${ctx.exitCode ?? "unknown"}`;
    return new CliError(
      "spawn_nonzero_exit",
      `${ctx.command} exited with ${detail}`,
      undefined,
      undefined,
    );
  }
}

export function isCliError(error: unknown): error is CliError {
  return error instanceof CliError;
}
