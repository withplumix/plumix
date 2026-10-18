import { describe, expect, test } from "vitest";

import type { MailRenderContext } from "./contract/registry.js";
import { emailChangeMail, magicLinkMail, mailTestMail } from "./core-mails.js";

const ctx: MailRenderContext = {
  locale: "en",
  siteName: "Tom & <b>Jerry</b>",
  baseUrl: "https://cms.example/",
  t: (descriptor, values) =>
    (descriptor.message ?? "").replace(
      /\{(\w+)\}/g,
      (_, key: string) => values?.[key] ?? "",
    ),
};

describe("core mails — HTML body", () => {
  test("escapes the site name and keeps a quote in the URL inside its href", () => {
    const html = magicLinkMail.html?.(
      { url: 'https://cms.example/v?a="x" onmouseover="y', ttlSeconds: 900 },
      ctx,
    );

    expect(html).toContain("Tom &amp; &lt;b&gt;Jerry&lt;/b&gt;");
    expect(html).toContain('href="https://cms.example/v?a=&quot;x&quot; ');
    expect(html).not.toContain('" onmouseover="y"');
  });

  test("escapes the addresses of an email change", () => {
    const html = emailChangeMail.html?.(
      {
        url: "https://cms.example/v",
        oldEmail: "a<i>@example.test",
        newEmail: "b@example.test",
        ttlSeconds: 3600,
      },
      ctx,
    );

    expect(html).toContain("From: a&lt;i&gt;@example.test<br>To:   b@");
    expect(html).not.toContain("<i>");
  });
});

describe("core mails — mailTest", () => {
  test("says which site sent it, when, and that it came through the deployed site", () => {
    const text = mailTestMail.text(
      {
        siteName: "Acme",
        sentAt: "2026-10-18T12:00:00.000Z",
        origin: "remote",
      },
      ctx,
    );

    expect(text).toBe(
      [
        "This is a test mail from Acme.",
        "It was sent by `plumix mail test --remote`, through the deployed site's mailer.",
        "Sent at 2026-10-18T12:00:00.000Z.",
        "If you can read this, the site's mailer delivers mail.",
      ].join("\n\n"),
    );
  });

  test("says a local test came from the command line", () => {
    const text = mailTestMail.text(
      { siteName: "Acme", sentAt: "2026-10-18T12:00:00.000Z", origin: "local" },
      ctx,
    );

    expect(text).toContain(
      "It was sent by `plumix mail test`, from the command line, through the mailer the site configures.",
    );
  });

  test("names the site in its subject and escapes it in the HTML body", () => {
    const props = {
      siteName: "Tom & <b>Jerry</b>",
      sentAt: "2026-10-18T12:00:00.000Z",
      origin: "local",
    } as const;

    expect(mailTestMail.subject(props, ctx)).toBe(
      "Test mail from Tom & <b>Jerry</b>",
    );
    expect(mailTestMail.html?.(props, ctx)).toContain(
      "<p>This is a test mail from Tom &amp; &lt;b&gt;Jerry&lt;/b&gt;.</p>",
    );
  });
});
