import type { AppContext } from "../context/app-context.js";
import type { MailTestMailProps } from "./core-mails.js";
import { mailSite } from "./sender.js";

/**
 * Sends core's `mailTest` through the site's mailer. Throws what the mailer
 * throws, and `MailerNotConfigured` on a site with none.
 */
export async function sendMailTest(
  ctx: AppContext,
  input: { readonly to: string; readonly origin: MailTestMailProps["origin"] },
): Promise<void> {
  const { siteName } = mailSite(
    ctx.config.auth.magicLink?.siteName,
    ctx.origin,
    ctx.config.basePath,
  );
  await ctx.mail.send(
    "mailTest",
    { siteName, sentAt: new Date().toISOString(), origin: input.origin },
    { to: input.to },
  );
}
