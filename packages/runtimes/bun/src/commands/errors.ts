import { CliError } from "plumix/cli";

type BunCliErrorCode = "bun_required";

/**
 * Bun's vocabulary, which core's runtime-agnostic `CliError` does not carry.
 */
export class BunCliError extends CliError<BunCliErrorCode> {
  static bunRequired(): BunCliError {
    return new BunCliError(
      "bun_required",
      "The Bun runtime's commands run on Bun, and this process is not Bun",
      "Run the command through Bun: `bun --bun plumix <command>`.",
      undefined,
    );
  }
}
