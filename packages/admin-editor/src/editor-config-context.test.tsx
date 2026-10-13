import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { BlockRegistry } from "@plumix/core/blocks";
import { createBlockRegistry } from "@plumix/core/blocks";

import {
  EditorConfigProvider,
  useEditorConfig,
} from "./editor-config-context.js";

const registry: BlockRegistry = createBlockRegistry([
  { name: "core/heading", render: () => null },
]);

function ConfigProbe(): ReactElement {
  const config = useEditorConfig();
  return (
    <output>
      {[
        registry === config.registry ? "registry" : "",
        config.tokens.spacing?.sm?.value ?? "",
        config.capabilities.has("edit") ? "edit" : "",
        config.resolvePluginFieldType?.("mediaUrl") ? "resolver" : "",
      ].join(":")}
    </output>
  );
}

describe("useEditorConfig", () => {
  test("throws when used outside a provider", () => {
    expect(() => renderToStaticMarkup(<ConfigProbe />)).toThrow(
      /EditorConfigProvider/,
    );
  });

  test("exposes the session-stable config to descendants", () => {
    const html = renderToStaticMarkup(
      <EditorConfigProvider
        registry={registry}
        tokens={{ spacing: { sm: { value: "8px" } } }}
        capabilities={new Set(["edit"])}
        resolvePluginFieldType={() => () => null}
      >
        <ConfigProbe />
      </EditorConfigProvider>,
    );

    expect(html).toBe("<output>registry:8px:edit:resolver</output>");
  });
});
