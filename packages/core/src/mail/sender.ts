import type { Mailer } from "../auth/contract/mailer.js";
import type { Db } from "../context/app-context.js";
import type { LocaleRegistry } from "../i18n/locale-registry.js";
import type { MailCatalogs } from "./catalogs.js";
import type {
  MailRecipient,
  MailRenderContext,
  MailSender,
} from "./contract/registry.js";
import type { DeclaredMails } from "./declared.js";
import { resolveMessage } from "../blocks/index.js";
import { eq } from "../db/index.js";
import { users } from "../db/schema/users.js";
import { findEnabledLocale } from "../i18n/locale-registry.js";
import { MailerNotConfigured, MailError } from "./contract/errors.js";

interface CreateMailSenderInput {
  readonly mails: DeclaredMails;
  readonly catalogs: MailCatalogs;
  readonly mailer: Mailer | undefined;
  /** Where an address is looked up to find the user it belongs to. */
  readonly db: Db;
  /** The site's locales, which a recipient's stored locale must be one of. */
  readonly i18n: LocaleRegistry;
  /** The request's resolved locale, the site default when it has none. */
  readonly locale: string;
  readonly siteName: string;
  readonly baseUrl: string;
}

export function createMailSender(input: CreateMailSenderInput): MailSender {
  return {
    async send(name, props, options) {
      const { mailer } = input;
      if (mailer === undefined) throw new MailerNotConfigured(name);
      const declared = input.mails.get(name);
      if (declared === undefined) {
        throw MailError.notDeclared({ mail: name });
      }
      const locale = await recipientLocale(input, options.to);
      const catalog = await input.catalogs(locale);
      const ctx: MailRenderContext = {
        locale,
        siteName: input.siteName,
        baseUrl: input.baseUrl,
        t: (descriptor, values) => resolveMessage(catalog, descriptor, values),
      };
      // Safety: `send` types `props` against the registry entry this name
      // declared, which is what the definition's render functions take.
      const typed = props as never;
      const { mail } = declared;
      await mailer.send({
        to: recipientAddress(options.to),
        subject: mail.subject(typed, ctx),
        text: mail.text(typed, ctx),
        html: mail.html?.(typed, ctx),
      });
    },
  };
}

// The recipient's stored locale when the recipient is a user, or the address
// belongs to one, and the site enables it; otherwise the request's.
async function recipientLocale(
  input: CreateMailSenderInput,
  recipient: MailRecipient,
): Promise<string> {
  const user =
    typeof recipient === "string"
      ? await input.db.query.users.findFirst({
          columns: { meta: true },
          where: eq(users.email, recipient.trim().toLowerCase()),
        })
      : recipient;
  const stored = user?.meta.locale;
  if (typeof stored !== "string") return input.locale;
  return findEnabledLocale(input.i18n, stored)?.code ?? input.locale;
}

function recipientAddress(recipient: MailRecipient): string {
  return typeof recipient === "string" ? recipient : recipient.email;
}
