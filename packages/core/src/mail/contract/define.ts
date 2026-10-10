import type { MailDefinition, MailParts } from "./registry.js";

/**
 * Sending by name is typed only once the declaring module adds a
 * `MailRegistry` entry of the same name.
 */
export function defineMail<Props>(
  name: string,
  mail: MailParts<Props> & { readonly preview: Props },
): MailDefinition<Props> {
  return { ...mail, name };
}
