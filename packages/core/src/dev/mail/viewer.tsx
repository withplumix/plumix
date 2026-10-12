import type { ReactNode } from "react";

import { css } from "../../css-tag.js";

interface MailViewProps {
  /** Unique in the document: it names the tabs' radio group. */
  readonly id: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
}

/**
 * Radios switch the tabs, so no script is needed. The iframe's empty sandbox
 * keeps a mail's markup and styles off the page around it.
 */
export function MailView({
  id,
  subject,
  text,
  html,
}: MailViewProps): ReactNode {
  const name = `plumix-mail-view-${id}`;
  return (
    <div className="plumix-mail-view">
      {html !== undefined ? (
        <input
          className="plumix-mail-view__radio plumix-mail-view__radio--html"
          type="radio"
          name={name}
          id={`${name}-html`}
          defaultChecked
        />
      ) : null}
      <input
        className="plumix-mail-view__radio plumix-mail-view__radio--text"
        type="radio"
        name={name}
        id={`${name}-text`}
        defaultChecked={html === undefined}
      />
      <div className="plumix-mail-view__tabs">
        {html !== undefined ? (
          <label
            className="plumix-mail-view__tab plumix-mail-view__tab--html"
            data-testid="plumix-mail-tab-html"
            htmlFor={`${name}-html`}
          >
            HTML
          </label>
        ) : null}
        <label
          className="plumix-mail-view__tab plumix-mail-view__tab--text"
          data-testid="plumix-mail-tab-text"
          htmlFor={`${name}-text`}
        >
          Text
        </label>
      </div>
      {html !== undefined ? (
        <iframe
          className="plumix-mail-view__html"
          data-testid="plumix-mail-html"
          sandbox=""
          srcDoc={html}
          title={`${subject} (HTML)`}
        />
      ) : null}
      <pre className="plumix-mail-view__text" data-testid="plumix-mail-text">
        {text}
      </pre>
    </div>
  );
}

interface MailViewColors {
  readonly fg: string;
  readonly muted: string;
  readonly border: string;
  readonly active: string;
  readonly radius: string;
  readonly mono: string;
}

/** The viewer's sheet, in the palette of the dev surface it sits in. */
export function mailViewCss(c: MailViewColors): string {
  return css`
    .plumix-mail-view__radio {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }
    .plumix-mail-view__tabs {
      display: flex;
      gap: 4px;
      margin: 6px 0;
    }
    .plumix-mail-view__tab {
      padding: 2px 10px;
      border: 1px solid ${c.border};
      border-radius: ${c.radius};
      color: ${c.muted};
      cursor: pointer;
    }
    .plumix-mail-view__radio--html:checked
      ~ .plumix-mail-view__tabs
      .plumix-mail-view__tab--html,
    .plumix-mail-view__radio--text:checked
      ~ .plumix-mail-view__tabs
      .plumix-mail-view__tab--text {
      background: ${c.active};
      color: ${c.fg};
    }
    .plumix-mail-view__html,
    .plumix-mail-view__text {
      display: none;
      box-sizing: border-box;
      width: 100%;
      margin: 0;
      border: 1px solid ${c.border};
      border-radius: ${c.radius};
    }
    .plumix-mail-view__html {
      height: 360px;
      /* A mail is written for a white mail client, whatever the chrome is. */
      background: #fff;
    }
    .plumix-mail-view__text {
      padding: 8px;
      font-family: ${c.mono};
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      color: ${c.fg};
    }
    .plumix-mail-view__radio--html:checked ~ .plumix-mail-view__html,
    .plumix-mail-view__radio--text:checked ~ .plumix-mail-view__text {
      display: block;
    }
  `;
}
