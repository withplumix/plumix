import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { StyleDeclaration } from "./style-declarations.js";
import { StyleDeclarations } from "./style-declarations.js";
import { StyleFieldsProvider } from "./style-fields-context.js";

const i18n = setupI18n({ locale: "en", messages: { en: {} } });

function markup(declarations: readonly StyleDeclaration[]): string {
  return renderToStaticMarkup(
    <I18nProvider i18n={i18n}>
      <StyleFieldsProvider tokens={{}}>
        <StyleDeclarations
          declarations={declarations}
          onChange={() => undefined}
          onRename={() => undefined}
        />
      </StyleFieldsProvider>
    </I18nProvider>,
  );
}

describe("StyleDeclarations", () => {
  test("lists each declaration with its raw value", () => {
    expect(markup([{ property: "color", value: "#0c2238" }])).toMatch(
      /data-testid="style-declaration-color-value" value="#0c2238"/,
    );
  });

  test("shows an empty hint when the block has no styles for the device", () => {
    expect(markup([])).toContain('data-testid="style-declarations-empty"');
  });

  test("shows no empty hint beside a declaration", () => {
    expect(markup([{ property: "color", value: "#0c2238" }])).not.toContain(
      'data-testid="style-declarations-empty"',
    );
  });
});
