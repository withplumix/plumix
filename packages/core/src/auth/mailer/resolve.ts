import type { PlumixEnv } from "../../runtime/bindings.js";
import type { EnvInput } from "../../runtime/env-input.js";
import type { Mailer } from "./types.js";
import { resolveEnvInput } from "../../runtime/env-input.js";

/**
 * The mailer config slot: a literal {@link Mailer}, or an `(env) => Mailer`
 * resolver for a transport whose API key only exists in the per-request `env`
 * (the Workers case). See {@link EnvInput} for the shared union + the typed
 * `env`; resolution is memoized per resolver.
 */
export type MailerInput = EnvInput<Mailer>;

export function resolveMailer(
  input: MailerInput | undefined,
  env: PlumixEnv,
): Mailer | undefined {
  return input === undefined ? undefined : resolveEnvInput(input, env);
}
