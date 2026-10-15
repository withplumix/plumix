import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { BlockNode } from "@plumix/core/blocks";
import { createBlockRegistry } from "@plumix/core/blocks";

import { EditorConfigProvider } from "./editor-config-context.js";
import { LayersTab } from "./layers-tab.js";
import { EditorProvider } from "./provider.js";

const i18n = setupI18n({ locale: "en", messages: { en: {} } });
const registry = createBlockRegistry([
  {
    name: "core/group",
    render: () => null,
    title: "Group",
    inputs: [{ name: "content", type: "slot" }],
  },
]);

function markup(tree: readonly BlockNode[]): string {
  return renderToStaticMarkup(
    <I18nProvider i18n={i18n}>
      <EditorConfigProvider
        registry={registry}
        tokens={{}}
        capabilities={new Set()}
      >
        <EditorProvider registry={registry} initialTree={tree}>
          <LayersTab />
        </EditorProvider>
      </EditorConfigProvider>
    </I18nProvider>,
  );
}

describe("LayersTab", () => {
  test("uses the registry title as the layer label", () => {
    expect(markup([{ id: "g", name: "core/group" }])).toMatch(
      /data-testid="layer-g"[^>]*>(<[^>]*>)*Group</,
    );
  });

  test("shows an empty state when there are no blocks", () => {
    expect(markup([])).toContain('data-testid="layers-empty"');
  });
});
