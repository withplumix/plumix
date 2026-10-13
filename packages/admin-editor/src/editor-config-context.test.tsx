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

function ConfigProbe({
  onConfig = () => undefined,
}: {
  readonly onConfig?: (config: ReturnType<typeof useEditorConfig>) => void;
}): ReactElement | null {
  onConfig(useEditorConfig());
  return null;
}

describe("useEditorConfig", () => {
  test("throws when used outside a provider", () => {
    expect(() => renderToStaticMarkup(<ConfigProbe />)).toThrow(
      /EditorConfigProvider/,
    );
  });

  test("exposes the session-stable config to descendants", () => {
    const seen: ReturnType<typeof useEditorConfig>[] = [];
    const resolve = (): (() => null) => () => null;

    renderToStaticMarkup(
      <EditorConfigProvider
        registry={registry}
        tokens={{ spacing: { sm: { value: "8px" } } }}
        capabilities={new Set(["edit"])}
        resolvePluginFieldType={resolve}
      >
        <ConfigProbe onConfig={(config) => seen.push(config)} />
      </EditorConfigProvider>,
    );

    expect(seen[0]?.registry).toBe(registry);
    expect(seen[0]?.tokens).toEqual({ spacing: { sm: { value: "8px" } } });
    expect(seen[0]?.capabilities.has("edit")).toBe(true);
    expect(seen[0]?.resolvePluginFieldType).toBe(resolve);
  });
});
