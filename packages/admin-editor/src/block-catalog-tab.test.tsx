import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { BlockPattern } from "@plumix/core/blocks";
import { createBlockRegistry } from "@plumix/core/blocks";

import { BlockCatalog } from "./block-catalog-tab.js";
import { EditorConfigProvider } from "./editor-config-context.js";
import { EditorProvider } from "./provider.js";

const i18n = setupI18n({ locale: "en", messages: { en: {} } });
const registry = createBlockRegistry([
  { name: "core/heading", render: () => null, title: "Heading" },
]);

function markup(patterns?: readonly BlockPattern[]): string {
  return renderToStaticMarkup(
    <I18nProvider i18n={i18n}>
      <EditorConfigProvider
        registry={registry}
        tokens={{}}
        capabilities={new Set()}
      >
        <EditorProvider registry={registry} initialTree={[]}>
          <BlockCatalog patterns={patterns} />
        </EditorProvider>
      </EditorConfigProvider>
    </I18nProvider>,
  );
}

describe("BlockCatalog", () => {
  test("omits the patterns section when there are none", () => {
    expect(markup()).not.toContain('data-testid="block-catalog-patterns"');
  });

  test("lists a patterns section when there are patterns", () => {
    expect(
      markup([{ name: "hero", title: "Hero banner", content: [] }]),
    ).toContain('data-testid="block-catalog-patterns"');
  });
});
