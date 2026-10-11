import type { ReactNode } from "react";

import type { CaughtMail } from "../../context/dev-runtime.js";
import type { ResolvedLocale } from "../../i18n/locale-registry.js";
import { css } from "../../css-tag.js";
import { devTokens } from "../ui/tokens.js";
import { MailView, mailViewCss } from "./viewer.js";

export interface PreviewedMail {
  readonly name: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
}

interface PreviewGroup {
  /** `core`, or the id of the plugin that declared the mails. */
  readonly owner: string;
  readonly mails: readonly PreviewedMail[];
}

interface MailGalleryProps {
  /** Core's group first, then each plugin's in install order. */
  readonly groups: readonly PreviewGroup[];
  /** The site's enabled locales, the switcher's options. */
  readonly locales: readonly ResolvedLocale[];
  readonly locale: ResolvedLocale;
  /** Newest first. */
  readonly caught: readonly CaughtMail[];
}

/** Every declared mail rendered from its `preview`, and the mail caught. */
export function MailGallery({
  groups,
  locales,
  locale,
  caught,
}: MailGalleryProps): ReactNode {
  return (
    <html lang="en" dir="ltr">
      <head>
        <meta charSet="utf-8" />
        <title>Mail previews</title>
        <style>{GALLERY_CSS}</style>
      </head>
      <body className="plumix-mail-gallery">
        <header>
          <h1>Mail previews</h1>
          <nav aria-label="Locale">
            {locales.map((option) => (
              <a
                key={option.code}
                href={`?locale=${encodeURIComponent(option.code)}`}
                title={option.label}
                data-testid={`plumix-mail-locale-${option.code}`}
                aria-current={option.code === locale.code ? "page" : undefined}
              >
                {option.code}
              </a>
            ))}
          </nav>
        </header>
        <p className="plumix-mail-gallery__note">
          Each declared mail, rendered from its preview props in {locale.label},
          with the site&apos;s and the theme&apos;s overrides applied.
        </p>
        {groups.map((group) => (
          <section key={group.owner} data-owner={group.owner}>
            <h2>{group.owner === "core" ? "Core" : group.owner}</h2>
            {group.mails.map((mail) => (
              <article
                key={mail.name}
                data-mail={mail.name}
                data-testid={`plumix-mail-preview-${mail.name}`}
              >
                <h3>{mail.name}</h3>
                <p
                  className="plumix-mail-gallery__subject"
                  data-testid="plumix-mail-subject"
                  dir={locale.direction}
                >
                  {mail.subject}
                </p>
                <MailView
                  id={`preview-${mail.name}`}
                  subject={mail.subject}
                  text={mail.text}
                  html={mail.html}
                />
              </article>
            ))}
          </section>
        ))}
        <section data-testid="plumix-mail-sent">
          <h2>Sent in dev</h2>
          {caught.length === 0 ? (
            <p className="plumix-mail-gallery__note">
              No mail caught yet. With no mailer configured, every mail the dev
              server sends lands here.
            </p>
          ) : (
            caught.map((mail) => (
              <article key={mail.id} data-mail={mail.name}>
                <h3>
                  {mail.name} → {mail.to}
                </h3>
                <p className="plumix-mail-gallery__subject">{mail.subject}</p>
                <p className="plumix-mail-gallery__note">
                  {new Date(mail.at).toISOString()} · {mail.locale}
                </p>
                <MailView
                  id={`sent-${mail.id}`}
                  subject={mail.subject}
                  text={mail.text}
                  html={mail.html}
                />
              </article>
            ))
          )}
        </section>
      </body>
    </html>
  );
}

const t = devTokens.bar;

const GALLERY_CSS =
  css`
    .plumix-mail-gallery {
      box-sizing: border-box;
      max-width: 960px;
      margin: 0 auto;
      padding: 32px;
      background: ${t.frame};
      color: ${t.fg};
      font: 14px/1.5 ${devTokens.errorPage.fontSans};
    }
    .plumix-mail-gallery header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 16px;
    }
    .plumix-mail-gallery h1 {
      margin: 0;
      font-size: 20px;
      color: ${t.fgStrong};
    }
    .plumix-mail-gallery h2 {
      margin: 32px 0 8px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: ${t.muted};
    }
    .plumix-mail-gallery h3 {
      margin: 0;
      font: 600 13px ${t.fontMono};
      color: ${t.accent};
    }
    .plumix-mail-gallery nav {
      display: flex;
      gap: 4px;
    }
    .plumix-mail-gallery nav a {
      padding: 2px 10px;
      border: 1px solid ${t.border};
      border-radius: ${t.radiusControl};
      color: ${t.label};
      text-decoration: none;
    }
    .plumix-mail-gallery nav a[aria-current="page"] {
      background: ${t.panel};
      color: ${t.fgStrong};
    }
    .plumix-mail-gallery article {
      margin-top: 8px;
      padding: 12px;
      background: ${t.card};
      border-radius: ${t.radiusCard};
    }
    .plumix-mail-gallery__subject {
      margin: 4px 0 0;
      font-weight: 600;
      color: ${t.fgStrong};
    }
    .plumix-mail-gallery__note {
      margin: 4px 0 0;
      color: ${t.muted};
    }
  ` +
  mailViewCss({
    fg: t.fgStrong,
    muted: t.muted,
    border: t.border,
    active: t.panel,
    radius: t.radiusControl,
    mono: t.fontMono,
  });
