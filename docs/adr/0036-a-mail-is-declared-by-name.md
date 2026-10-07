# A mail is declared by name

Plumix sent three emails, and each was built where it was sent. The magic-link
and email-change requests assembled an `EmailMessage` from a locale-keyed table
of string fragments. The comments plugin built a hardcoded English, text-only
message. No site or theme could change what any of them said or how it looked,
nothing could render one without sending it, and a plugin had no way to
localize its own (#2928, part of #2927).

> **A mail is declared once, by name, with `defineMail(name, { subject, text,
html?, preview })`. Its props are registered in `MailRegistry`, and
> `ctx.mail.send(name, props, { to })` renders it in the recipient's locale and
> hands the result to the configured `Mailer`. Core declares its own mails; a
> plugin declares its mails in its descriptor's `mails` field. A site's
> `mail.overrides` and a theme's `mail` field replace any of a mail's render
> functions by name. The `Mailer` contract does not change.**

The reference is Laravel's Mailables: a mail is a class with a name, the data
it renders from and its own view, and the transport only delivers what it is
handed.

## What this means

- **Typed by a registry.** `MailRegistry` maps a mail's name to its props, the
  pattern `FilterRegistry` and `ActionRegistry` set. `defineMail`, `send` and
  every override take their props from it, so an unknown name or the wrong
  props fail to compile. Core seeds `magicLink` and `emailChange`; a plugin
  augments `"plumix"` from its own module.
- **Known at boot.** Declarations are descriptor data, not setup calls, so
  `buildApp` sees every mail before the first request. Two owners declaring
  one name stop the boot with an error naming both. So does an override of a
  name nobody declared: the registry can type a name whose plugin is not
  installed.
- **Override precedence is site, then theme, then the owner.** It is decided
  per render function, so a site that overrides only `subject` keeps the
  theme's `html`. The site is the most specific layer, as it is for blocks,
  shortcodes and redirects.
- **The recipient's locale.** A user's stored `meta.locale` when the recipient
  is a user, or the address belongs to one, and the site enables it; else the
  request's locale; else the site default. A mail resolves its strings with
  `ctx.t`, against core's mail catalog under every plugin's catalog, the merge
  block render strings use. A caller whose recipient is a user at an address
  that is not yet theirs (email change) passes the user.
- **The transport is unchanged.** `Mailer.send(EmailMessage)` still receives a
  subject, a text body and an optional HTML body. A provider adapter needs no
  change, and one never sees a mail's name or props.
- **No mailer is an error the caller chooses to ignore.** `send` throws
  `MailerNotConfigured` on a site with no `mailer`. Comments catch it, because
  moderator mail is optional. The magic-link request swallows every send
  failure and logs it, because a response that differed would reveal whether
  the address is registered.
- **`preview` is part of the declaration.** Every mail carries sample props, so
  a gallery or a test can render it with no real send behind it.

## Considered options

- **Anonymous messages, with test helpers bolted on.** Keep building an
  `EmailMessage` at each call site and add helpers that capture and inspect
  what a mailer received. Rejected: a test could assert on a message, but a
  site still could not restyle it, a plugin still could not localize it, and
  nothing could render one for a preview without driving the flow that sends
  it. Each of those needs a name to hang on.
- **Per-transport templates.** Let each `Mailer` adapter own the templates, as
  some providers host them. Rejected: the look of a mail would depend on which
  provider a deploy uses, an override would have to be written once per
  provider, and the `Mailer` contract would grow a template id and a data bag
  that every adapter must understand.

## Consequences

- Core's mail strings live in `locales/mail-*.po`, hand-authored like core's
  other server-rendered surfaces and checked by `plumix i18n verify`.
- A unit test that asserts on translated output hands the committed `.po` in as
  a plugin catalog, because unit tests resolve compiled catalogs to empty ones.
- Anything that adds a mail adds a `MailRegistry` entry and a declaration. A
  core flow that sends one writes neither a subject nor a body at its call
  site.
