import type { EmailMessage } from "../auth/contract/mailer.js";
import type { MailName, MailRegistry } from "../mail/contract/registry.js";
import type { PluginCatalogs } from "../route/render/block-catalog.js";
import type { TestConfigInput } from "./config.js";
import { createMailCatalogs } from "../mail/catalogs.js";
import { MailError } from "../mail/contract/errors.js";
import { declareMails } from "../mail/declared.js";
import { mailSite, renderDeclaredMail } from "../mail/sender.js";
import { mailerOrFake, testConfig } from "./config.js";
import { fakeMail } from "./mail-fake.js";

const TEST_ORIGIN = "https://cms.example";

export interface RenderMailOptions {
  /** Defaults to the site's default locale. */
  readonly locale?: string;
  /** Defaults to the magic-link `siteName`, else the test origin's host. */
  readonly siteName?: string;
  /** The plugins that declare mail, and the theme and site overrides. */
  readonly config?: TestConfigInput;
  /**
   * Compiled catalogs by locale, merged over core's: a plugin's own
   * translations, which a build supplies otherwise.
   */
  readonly pluginCatalogs?: PluginCatalogs;
}

/**
 * A mail rendered as `ctx.mail.send` renders it, overrides included, with no
 * recipient and no send. Throws `MailError` for a name nobody declares.
 */
export async function renderMail<Name extends MailName>(
  name: Name,
  props: MailRegistry[Name],
  options: RenderMailOptions = {},
): Promise<Omit<EmailMessage, "to">> {
  // A magic-link config will not build without a mailer, though nothing sends.
  const config = testConfig(mailerOrFake(options.config, fakeMail()));
  const declared = declareMails({
    plugins: config.plugins,
    theme: config.theme.mail,
    site: config.mail?.overrides,
  }).get(name);
  if (declared === undefined) throw MailError.notDeclared({ mail: name });
  const site = mailSite(
    config.auth.magicLink?.siteName,
    TEST_ORIGIN,
    config.basePath,
  );
  return renderDeclaredMail({
    mail: declared.mail,
    props,
    locale: options.locale ?? config.i18n.defaultLocale.code,
    catalogs: createMailCatalogs(options.pluginCatalogs),
    ...site,
    siteName: options.siteName ?? site.siteName,
  });
}
