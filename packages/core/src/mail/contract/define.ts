import type { MailDefinition, MailParts } from "./registry.js";

/**
 * Declares a mail by name, rendered from `Props`. Pass `Props` explicitly, or
 * let it be inferred from `preview`. Sending it by name is typed by the
 * `MailRegistry` entry of the same name, which the declaring module adds
 * beside it. Core declares its own mails; a plugin lists its mails in its
 * descriptor's `mails` field.
 */
export function defineMail<Props>(
  name: string,
  mail: MailParts<Props> & { readonly preview: Props },
): MailDefinition<Props> {
  return { ...mail, name };
}
