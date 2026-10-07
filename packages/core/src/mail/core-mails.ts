// Core's own mails. Their strings live in `locales/mail-*.po`, hand-authored
// like every server-rendered surface in core (no Babel pass reads them);
// `plumix i18n verify` gates the descriptors below against those catalogs.

import type { MailRenderContext } from "./contract/registry.js";
import { escapeHtml } from "../escape-html.js";
import { defineMail } from "./contract/define.js";

/** Props of `magicLink`, the sign-in (or sign-up) link core mails. */
export interface MagicLinkMailProps {
  /** The single-use verify URL the recipient opens. */
  readonly url: string;
  /** How long the link stays valid. */
  readonly ttlSeconds: number;
}

/** Props of `emailChange`, the confirmation core mails to a new address. */
export interface EmailChangeMailProps {
  /** The single-use verify URL that commits the change. */
  readonly url: string;
  readonly oldEmail: string;
  readonly newEmail: string;
  /** How long the link stays valid. */
  readonly ttlSeconds: number;
}

declare module "./contract/registry.js" {
  interface MailRegistry {
    magicLink: MagicLinkMailProps;
    emailChange: EmailChangeMailProps;
  }
}

const M = {
  magicLinkSubject: {
    id: "core.mail.magicLink.subject",
    message: "Sign in to {siteName}",
  },
  magicLinkIntro: {
    id: "core.mail.magicLink.intro",
    message: "Sign in to {siteName} by opening this link:",
  },
  magicLinkExpires: {
    id: "core.mail.magicLink.expires",
    message: "The link expires in {minutes} minutes.",
  },
  magicLinkIgnore: {
    id: "core.mail.magicLink.ignore",
    message: "If you didn't request this, you can ignore this email.",
  },
  emailChangeSubject: {
    id: "core.mail.emailChange.subject",
    message: "Confirm your new email for {siteName}",
  },
  emailChangeIntro: {
    id: "core.mail.emailChange.intro",
    message:
      "Someone — hopefully you — asked to change the email on your {siteName} account.",
  },
  emailChangeFrom: {
    id: "core.mail.emailChange.from",
    message: "From: {oldEmail}",
  },
  emailChangeTo: {
    id: "core.mail.emailChange.to",
    message: "To:   {newEmail}",
  },
  emailChangeConfirm: {
    id: "core.mail.emailChange.confirm",
    message: "Confirm the change by opening this link:",
  },
  // Two messages rather than a plural: catalogs resolve `{name}` slots only.
  emailChangeExpiresOneHour: {
    id: "core.mail.emailChange.expiresOneHour",
    message: "The link expires in 1 hour.",
  },
  emailChangeExpiresHours: {
    id: "core.mail.emailChange.expiresHours",
    message: "The link expires in {hours} hours.",
  },
  emailChangeIgnore: {
    id: "core.mail.emailChange.ignore",
    message:
      "If you didn't request this, you can ignore this email — your account stays on {oldEmail}.",
  },
} as const;

// A body is paragraphs and one link: the text joins them with blank lines,
// the HTML wraps each one, keeping a paragraph's own line breaks. Every value
// is escaped, since a site name and an address are the site's and the user's
// input.
type Block = { readonly text: string } | { readonly link: string };

function textBody(blocks: readonly Block[]): string {
  return blocks
    .map((block) => ("link" in block ? block.link : block.text))
    .join("\n\n");
}

function htmlBody(blocks: readonly Block[]): string {
  return blocks
    .map((block) => {
      if ("link" in block) {
        const href = escapeHtml(block.link).replace(/"/g, "&quot;");
        return `<p><a href="${href}">${escapeHtml(block.link)}</a></p>`;
      }
      return `<p>${escapeHtml(block.text).replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");
}

function magicLinkBody(
  props: MagicLinkMailProps,
  ctx: MailRenderContext,
): readonly Block[] {
  const minutes = String(Math.round(props.ttlSeconds / 60));
  return [
    { text: ctx.t(M.magicLinkIntro, { siteName: ctx.siteName }) },
    { link: props.url },
    { text: ctx.t(M.magicLinkExpires, { minutes }) },
    { text: ctx.t(M.magicLinkIgnore) },
  ];
}

export const magicLinkMail = defineMail<MagicLinkMailProps>("magicLink", {
  subject: (_props, ctx) =>
    ctx.t(M.magicLinkSubject, { siteName: ctx.siteName }),
  text: (props, ctx) => textBody(magicLinkBody(props, ctx)),
  html: (props, ctx) => htmlBody(magicLinkBody(props, ctx)),
  preview: {
    url: "https://example.com/_plumix/auth/magic-link/verify?token=preview",
    ttlSeconds: 15 * 60,
  },
});

function emailChangeBody(
  props: EmailChangeMailProps,
  ctx: MailRenderContext,
): readonly Block[] {
  const hours = Math.round(props.ttlSeconds / 3600);
  const expires =
    hours === 1
      ? ctx.t(M.emailChangeExpiresOneHour)
      : ctx.t(M.emailChangeExpiresHours, { hours: String(hours) });
  const from = ctx.t(M.emailChangeFrom, { oldEmail: props.oldEmail });
  const to = ctx.t(M.emailChangeTo, { newEmail: props.newEmail });
  return [
    { text: ctx.t(M.emailChangeIntro, { siteName: ctx.siteName }) },
    { text: `${from}\n${to}` },
    { text: ctx.t(M.emailChangeConfirm) },
    { link: props.url },
    { text: expires },
    { text: ctx.t(M.emailChangeIgnore, { oldEmail: props.oldEmail }) },
  ];
}

export const emailChangeMail = defineMail<EmailChangeMailProps>("emailChange", {
  subject: (_props, ctx) =>
    ctx.t(M.emailChangeSubject, { siteName: ctx.siteName }),
  text: (props, ctx) => textBody(emailChangeBody(props, ctx)),
  html: (props, ctx) => htmlBody(emailChangeBody(props, ctx)),
  preview: {
    url: "https://example.com/_plumix/auth/verify-email?token=preview",
    oldEmail: "ann@example.com",
    newEmail: "ann@example.org",
    ttlSeconds: 24 * 60 * 60,
  },
});

/** The mails core declares, under the owner name `core`. */
export const CORE_MAILS = [magicLinkMail, emailChangeMail] as const;
