import { i18n } from "@lingui/core";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { I18nProvider, Trans } from "./index.js";

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
});
