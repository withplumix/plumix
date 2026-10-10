/**
 * `ctx.mail.send` was called on a site with no `mailer` config slot. A caller
 * for whom mail is optional catches it and carries on.
 */
export class MailerNotConfigured extends Error {
  static {
    MailerNotConfigured.prototype.name = "MailerNotConfigured";
  }

  readonly mail: string;

  constructor(mail: string) {
    super(
      `Mail "${mail}" was not sent: the site has no \`mailer\` configured.`,
    );
    this.mail = mail;
  }
}

/** `ctx.mail.send` was called with a name no installed owner declares. */
export class MailError extends Error {
  static {
    MailError.prototype.name = "MailError";
  }

  readonly code: "mail_not_declared";
  readonly mail: string;

  private constructor(
    code: "mail_not_declared",
    message: string,
    mail: string,
  ) {
    super(message);
    this.code = code;
    this.mail = mail;
  }

  /**
   * Reachable when a registry entry is typed but its plugin isn't installed.
   */
  static notDeclared(ctx: { mail: string }): MailError {
    return new MailError(
      "mail_not_declared",
      `Mail "${ctx.mail}" is not declared by core or any installed plugin.`,
      ctx.mail,
    );
  }
}
