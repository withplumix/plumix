import { describe, expect, test } from "vitest";

import { createMailCatalogs } from "../mail/catalogs.js";
import { poCatalogs } from "./po-catalog.js";
import { renderMail, renderMailIn } from "./render-mail.js";

const PREVIEW = {
  url: "https://example.com/_plumix/auth/magic-link/verify?token=preview",
  ttlSeconds: 900,
};

describe("renderMail", () => {
  test("renders a mail in the locale asked for", async () => {
    // Core's own catalog, which unit tests otherwise resolve to empty.
    const catalogs = createMailCatalogs(
      poCatalogs({ de: new URL("../../locales/mail-de.po", import.meta.url) }),
    );

    const rendered = await renderMailIn(catalogs, "magicLink", PREVIEW, {
      locale: "de",
      siteName: "Test Site",
    });

    expect(rendered.subject).toBe("Bei Test Site anmelden");
  });
});

describe("renderMail with a config", () => {
  test("applies the site's override, as sending does", async () => {
    const rendered = await renderMail("magicLink", PREVIEW, {
      config: {
        auth: { magicLink: { siteName: "Test Site" } },
        mail: {
          overrides: {
            magicLink: { subject: (_props, ctx) => `Hi from ${ctx.siteName}` },
          },
        },
      },
    });

    expect(rendered.subject).toBe("Hi from Test Site");
    expect(rendered.text).toContain("The link expires in 15 minutes.");
  });
});
