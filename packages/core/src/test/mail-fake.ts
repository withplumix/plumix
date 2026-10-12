import type { Mailer } from "../auth/contract/mailer.js";
import type { MailName, MailRegistry } from "../mail/contract/registry.js";
import type { SentMail } from "../mail/sender.js";

/** A mail the fake recorded, with the props it was sent with. */
export interface CapturedMail<Name extends MailName> {
  readonly props: MailRegistry[Name];
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
}

interface MailFilter<Name extends MailName> {
  /** The recipient's address, exactly as it was sent to. */
  readonly to?: string;
  readonly where?: (props: MailRegistry[Name]) => boolean;
}

/**
 * Records what `ctx.mail.send` sent. Each assertion throws a plain `Error`
 * listing the mail actually sent, so it reads the same in any test runner.
 */
export interface MailFake extends Mailer {
  /** Throws unless a matching mail was sent, exactly `times` times if given. */
  readonly assertSent: <Name extends MailName>(
    name: Name,
    options?: MailFilter<Name> & { readonly times?: number },
  ) => void;
  readonly assertNotSent: <Name extends MailName>(
    name: Name,
    options?: MailFilter<Name>,
  ) => void;
  readonly assertNothingSent: () => void;
  /** Counts every mail, whatever its name. */
  readonly assertSentCount: (count: number) => void;
  readonly sent: <Name extends MailName>(
    name: Name,
  ) => readonly CapturedMail<Name>[];
  /** Takes each mail the transport accepted. */
  readonly record: (sent: SentMail) => void;
}

/**
 * A fake that is also the transport: its `send` delivers nothing, so a site
 * with a magic-link config boots with it as the `mailer`.
 */
export function fakeMail(): MailFake {
  const recorded: SentMail[] = [];

  function matching<Name extends MailName>(
    name: Name,
    filter: MailFilter<Name> = {},
  ): CapturedMail<Name>[] {
    return recorded
      .filter((mail) => mail.name === name)
      .map(captured<Name>)
      .filter(
        (mail) =>
          (filter.to === undefined || mail.to === filter.to) &&
          (filter.where === undefined || filter.where(mail.props)),
      );
  }

  function fail(expectation: string): never {
    throw new Error(`${expectation}\n${describeSent(recorded)}`);
  }

  return {
    send: () => Promise.resolve(),
    record: (sent) => {
      recorded.push(sent);
    },
    sent: (name) => matching(name),
    assertSent: (name, options = {}) => {
      const count = matching(name, options).length;
      const { times } = options;
      if (times === undefined && count > 0) return;
      if (times === count) return;
      const wanted = times === undefined ? "" : ` ${plural(times, "time")}`;
      fail(
        `Expected ${describeMail(name, options)} to be sent${wanted}, ` +
          `but it was sent ${plural(count, "time")}.`,
      );
    },
    assertNotSent: (name, options = {}) => {
      const count = matching(name, options).length;
      if (count === 0) return;
      fail(
        `Expected ${describeMail(name, options)} not to be sent, ` +
          `but it was sent ${plural(count, "time")}.`,
      );
    },
    assertNothingSent: () => {
      if (recorded.length === 0) return;
      fail(`Expected no mail to be sent, but ${wasSent(recorded.length)}.`);
    },
    assertSentCount: (count) => {
      if (recorded.length === count) return;
      fail(
        `Expected ${plural(count, "mail")} to be sent, ` +
          `but ${wasSent(recorded.length)}.`,
      );
    },
  };
}

function captured<Name extends MailName>(mail: SentMail): CapturedMail<Name> {
  // Safety: `ctx.mail.send` takes the props the registry types for the name,
  // and only mail of that name reaches here.
  const props = mail.props as MailRegistry[Name];
  const { to, subject, text, html } = mail.message;
  return { props, to, subject, text, html };
}

function describeMail(name: string, filter: MailFilter<never>): string {
  const to = filter.to === undefined ? "" : ` to ${filter.to}`;
  const where = filter.where === undefined ? "" : " matching `where`";
  return `mail "${name}"${to}${where}`;
}

function describeSent(recorded: readonly SentMail[]): string {
  if (recorded.length === 0) return "No mail was sent.";
  const lines = recorded.map(
    (mail) => `  - "${mail.name}" to ${mail.message.to}`,
  );
  return ["Mail sent:", ...lines].join("\n");
}

function plural(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? "" : "s"}`;
}

function wasSent(count: number): string {
  return `${String(count)} ${count === 1 ? "was" : "were"}`;
}
