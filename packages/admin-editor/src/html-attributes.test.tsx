import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { HtmlAttributes } from "./html-attributes.js";

const i18n = setupI18n({ locale: "en", messages: { en: {} } });

function markup(attributes: Readonly<Record<string, string>>): string {
  return renderToStaticMarkup(
    <I18nProvider i18n={i18n}>
      <HtmlAttributes
        attributes={attributes}
        onChange={() => undefined}
        onRename={() => undefined}
      />
    </I18nProvider>,
  );
}

describe("HtmlAttributes", () => {
  test("lists existing attributes as editable key/value rows", () => {
    const html = markup({ id: "hero", "data-track": "cta" });

    expect(html).toMatch(/data-testid="html-attr-id-key" value="id"/);
    expect(html).toMatch(
      /data-testid="html-attr-data-track-value" value="cta"/,
    );
  });

  test("shows an empty hint when no attribute is set", () => {
    expect(markup({})).toContain('data-testid="html-attributes-empty"');
  });
});
