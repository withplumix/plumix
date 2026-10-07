import type {
  MailDefinition,
  MailName,
  MailParts,
  MailRegistry,
} from "./registry.js";

/**
 * Declares a mail by name. Its props come from the `MailRegistry` entry of
 * the same name, so the render functions, the `preview` sample and every
 * `ctx.mail.send` of it are typed against one declaration. Core declares its
 * own mails; a plugin lists its mails in its descriptor's `mails` field.
 */
export function defineMail<Name extends MailName>(
  name: Name,
  mail: MailParts<MailRegistry[Name]> & {
    readonly preview: MailRegistry[Name];
  },
): MailDefinition<MailRegistry[Name]> {
  return { ...mail, name };
}
