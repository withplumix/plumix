import type { PlumixEnv } from "../../runtime/contract/bindings.js";
import type { Mailer, MailerInput } from "../contract/mailer.js";
import { resolveEnvInput } from "../../runtime/contract/env-input.js";

export function resolveMailer(
  input: MailerInput | undefined,
  env: PlumixEnv,
): Mailer | undefined {
  return input === undefined ? undefined : resolveEnvInput(input, env);
}
