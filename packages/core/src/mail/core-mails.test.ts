import { describe, expect, test } from "vitest";

import type { MailRenderContext } from "./contract/registry.js";
import { emailChangeMail, magicLinkMail } from "./core-mails.js";

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
