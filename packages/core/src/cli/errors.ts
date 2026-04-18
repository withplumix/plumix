export interface CliErrorOptions {
  readonly code: string;
  readonly hint?: string;
  readonly cause?: unknown;
}

export class CliError extends Error {
  readonly code: string;
  readonly hint: string | undefined;

  constructor(message: string, options: CliErrorOptions) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "CliError";
    this.code = options.code;
    this.hint = options.hint;
  }
}

export function isCliError(error: unknown): error is CliError {
  return error instanceof CliError;
}
