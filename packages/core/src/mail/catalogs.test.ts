import { describe, expect, test } from "vitest";

import { createMailCatalogs } from "./catalogs.js";

describe("createMailCatalogs", () => {
  test("reads an enabled regional locale from its catalog locale", async () => {
    const mailCatalogs = createMailCatalogs(
      {},
      { "de-AT": "de" },
      {
        de: () =>
          Promise.resolve({
            messages: { "core.mail.magicLink.subject": "Anmelden" },
          }),
      },
    );
    expect(await mailCatalogs("de-AT")).toEqual({
      "core.mail.magicLink.subject": "Anmelden",
    });
  });
});
