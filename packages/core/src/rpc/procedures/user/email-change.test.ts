import { describe, expect, test } from "vitest";

import { createMailCatalogs } from "../../../mail/catalogs.js";
import { poCatalogs } from "../../../test/po-catalog.js";
import { renderMailIn } from "../../../test/render-mail.js";

// That a user's own locale picks the mail's is a feature test, in
// tests/feature/changing-an-email-address.test.ts; a test site renders with
// the stubbed catalogs, so the German text is checked here.
describe("the emailChange mail in German", () => {
  test("reads the shipped catalog", async () => {
    // Core's own catalog, which unit tests otherwise resolve to empty.
    const catalogs = createMailCatalogs(
      poCatalogs({
        de: new URL("../../../../locales/mail-de.po", import.meta.url),
      }),
    );

    const sent = await renderMailIn(
      catalogs,
      "emailChange",
      {
        url: "https://cms.example/_plumix/auth/verify-email?token=t",
        oldEmail: "klaus@old.example",
        newEmail: "klaus@new.example",
        ttlSeconds: 24 * 60 * 60,
      },
      { locale: "de", config: { auth: { magicLink: { siteName: "Test" } } } },
    );

    expect(sent.subject).toBe("Bestätigen Sie Ihre neue E-Mail für Test");
    expect(sent.text).toContain("Von: klaus@old.example");
    expect(sent.text).toContain("Der Link läuft in 24 Stunden ab.");
    expect(sent.html).toContain(
      "Bestätigen Sie die Änderung über diesen Link:",
    );
  });
});
