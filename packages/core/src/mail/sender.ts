import type { EmailMessage, Mailer } from "../auth/contract/mailer.js";
import type { Db } from "../context/app-context.js";
import type { LocaleRegistry } from "../i18n/locale-registry.js";
import type { MailCatalogs } from "./catalogs.js";
import type {
  AnyMailDefinition,
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
  readonly db: Db;
  /** A recipient's stored locale counts only if it is one of these. */
  readonly i18n: LocaleRegistry;
  /** The request's resolved locale, the site default when it has none. */
  readonly locale: string;
  readonly siteName: string;
  readonly baseUrl: string;
  /** Called with each mail the mailer accepted. */
  readonly onSent?: (sent: SentMail) => void;
}

/** A mail `ctx.mail.send` rendered and the mailer accepted. */
export interface SentMail {
  readonly name: string;
  readonly props: unknown;
  readonly locale: string;
  readonly message: EmailMessage;
}

/** Where a site's mails say they come from: its name and public root. */
export function mailSite(
  magicLinkSiteName: string | undefined,
  origin: string,
  basePath: string,
): { readonly siteName: string; readonly baseUrl: string } {
  return {
    // The magic-link slot names the site; a site without it is named by its
    // host.
    siteName: magicLinkSiteName ?? new URL(origin).host,
    baseUrl: new URL(`${basePath}/`, origin).href,
  };
}

interface RenderMailInput {
  readonly mail: AnyMailDefinition;
  readonly props: unknown;
  readonly locale: string;
  readonly catalogs: MailCatalogs;
  readonly siteName: string;
  readonly baseUrl: string;
}

/** A declared mail rendered in `locale`, with no recipient and no send. */
export async function renderDeclaredMail(
  input: RenderMailInput,
): Promise<Omit<EmailMessage, "to">> {
  const catalog = await input.catalogs(input.locale);
  const ctx: MailRenderContext = {
    locale: input.locale,
    siteName: input.siteName,
    baseUrl: input.baseUrl,
    t: (descriptor, values) => resolveMessage(catalog, descriptor, values),
  };
  // Safety: callers pass the props the registry typed for this mail's name,
  // or the mail's own `preview`, which is what its render functions take.
  const typed = input.props as never;
  const { mail } = input;
  return {
    subject: mail.subject(typed, ctx),
    text: mail.text(typed, ctx),
    html: mail.html?.(typed, ctx),
  };
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
      const message: EmailMessage = {
        to: recipientAddress(options.to),
        ...(await renderDeclaredMail({
          mail: declared.mail,
          props,
          locale,
          catalogs: input.catalogs,
          siteName: input.siteName,
          baseUrl: input.baseUrl,
        })),
      };
      await mailer.send(message);
      input.onSent?.({ name, props, locale, message });
    },
  };
}

/**
 * The recipient's stored locale when the recipient is a user, or the address
 * belongs to one, and the site enables it; otherwise the request's.
 */
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
