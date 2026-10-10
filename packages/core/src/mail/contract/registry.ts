import type { MessageDescriptor } from "@lingui/core";

import type { MessageValues } from "../../blocks/index.js";
import type { JsonObject } from "../../json.js";

// Each declared mail augments this, keyed by name, with its props; only
// `defineMail` makes the mail exist at runtime.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MailRegistry {}

// `keyof` of an empty interface is `never`; augmentation makes it a union.
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
export type MailName = keyof MailRegistry & string;

/** What a mail's render functions read beside its props. */
export interface MailRenderContext {
  /** The locale the mail renders in, already resolved for the recipient. */
  readonly locale: string;
  readonly siteName: string;
  /** The site's public root, base path included, with a trailing slash. */
  readonly baseUrl: string;
  /**
   * Translates a descriptor into {@link locale}: core's mail catalog and every
   * installed plugin's, falling back to the descriptor's English `message`.
   * Only `{name}` placeholders are filled.
   */
  readonly t: (descriptor: MessageDescriptor, values?: MessageValues) => string;
}

export type MailRender<Props> = (
  props: Props,
  ctx: MailRenderContext,
) => string;

/**
 * The render functions a mail is made of, and the ones an override replaces.
 */
export interface MailParts<Props> {
  readonly subject: MailRender<Props>;
  /** The plain-text body. Every mail has one. */
  readonly text: MailRender<Props>;
  readonly html?: MailRender<Props>;
}

export interface MailDefinition<Props> extends MailParts<Props> {
  readonly name: string;
  /** Sample props the preview gallery and `renderMail` render with. */
  readonly preview: Props;
}

/**
 * The methods take `never` so every `MailDefinition<Props>` is assignable;
 * the sender passes props `send` already typed against the registry.
 */
export interface AnyMailDefinition {
  readonly name: string;
  subject(this: void, props: never, ctx: MailRenderContext): string;
  text(this: void, props: never, ctx: MailRenderContext): string;
  html?(this: void, props: never, ctx: MailRenderContext): string;
  readonly preview: unknown;
}

/** Replacements for some of a mail's render functions. */
export type MailOverride<Props> = Partial<MailParts<Props>>;

/** Overrides by mail name, each typed against that mail's props. */
export type MailOverrides = {
  readonly [Name in MailName]?: MailOverride<MailRegistry[Name]>;
};

/** The site's `mail` config slot. */
export interface MailConfig {
  /** Win over a theme's `mail` overrides and the declaring owner's default. */
  readonly overrides?: MailOverrides;
}

/**
 * Who a mail goes to: an address, or a user. A user's stored locale picks the
 * language; an address that belongs to a user does the same.
 */
export type MailRecipient =
  string | { readonly email: string; readonly meta: JsonObject };

export interface MailSendOptions {
  readonly to: MailRecipient;
}

/** `ctx.mail`: sends a declared mail by name. */
export interface MailSender {
  /**
   * Throws `MailerNotConfigured` when the site has no mailer, `MailError` when
   * no installed owner declares the name, and whatever the mailer throws.
   */
  send<Name extends MailName>(
    name: Name,
    props: MailRegistry[Name],
    options: MailSendOptions,
  ): Promise<void>;
}
