import { i18n } from "@lingui/core";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { I18nProvider, Trans, withContext } from "./index.js";

describe("plumix/i18n — Lingui round-trip", () => {
  test("Trans renders the German message when the de catalog is active", () => {
    i18n.load({
      en: { dashboard: "Dashboard" },
      de: { dashboard: "Übersicht" },
    });
    i18n.activate("de");

    const html = renderToString(
      <I18nProvider i18n={i18n}>
        <Trans id="dashboard" message="Dashboard" />
      </I18nProvider>,
    );

    expect(html).toContain("Übersicht");
  });

  test("withContext is re-exported as a runtime helper from plumix/i18n", () => {
    const tagged = withContext(
      { id: "post.singular", message: "Post" },
      "noun",
    );
    expect(tagged.context).toBe("noun");
  });
});
