import { parseArgs } from "node:util";
import type { ParseArgsOptionsConfig } from "node:util";

import type { RuntimeTargetOptions, TargetOptionValues } from "@plumix/core";

import { PlumixCliError } from "./errors.js";

interface CommandArgsSpec<Options extends ParseArgsOptionsConfig> {
  readonly command: string;
  readonly runtime: string;
  readonly options: Options;
  readonly targetOptions: RuntimeTargetOptions | undefined;
  readonly invalid: (cause: unknown) => PlumixCliError;
}

interface ParsedCommandArgs<Options extends ParseArgsOptionsConfig> {
  readonly values: ReturnType<
    typeof parseArgs<{ options: Options; allowPositionals: true }>
  >["values"];
  readonly positionals: readonly string[];
  readonly targetValues: TargetOptionValues;
}

function unknownOptionOf(cause: unknown): string | undefined {
  if (!(cause instanceof TypeError)) return undefined;
  if ((cause as { code?: unknown }).code !== "ERR_PARSE_ARGS_UNKNOWN_OPTION") {
    return undefined;
  }
  return /'([^']+)'/.exec(cause.message)?.[1];
}

/**
 * A command's own options and the target options its runtime declares,
 * parsed strictly together; the target values come back apart.
 */
export function parseCommandArgs<Options extends ParseArgsOptionsConfig>(
  argv: readonly string[],
  spec: CommandArgsSpec<Options>,
): ParsedCommandArgs<Options> {
  const targetOptions = spec.targetOptions ?? {};
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      options: { ...targetOptions, ...spec.options },
      allowPositionals: true,
      strict: true,
    });
  } catch (cause) {
    const option = unknownOptionOf(cause);
    if (option !== undefined) {
      throw PlumixCliError.unknownOption({
        command: spec.command,
        option,
        runtime: spec.runtime,
      });
    }
    throw spec.invalid(cause);
  }
  const values = parsed.values as Record<string, string | boolean | undefined>;
  const targetValues = Object.fromEntries(
    Object.keys(targetOptions)
      .filter((name) => values[name] !== undefined)
      .map((name) => [name, values[name]]),
  );
  return {
    values: parsed.values,
    positionals: parsed.positionals,
    targetValues,
  };
}
