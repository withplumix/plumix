import type { ReactElement } from "react";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { BlockNode } from "@plumix/core/blocks";
import { createBlockRegistry } from "@plumix/core/blocks";

import type {
  PluginFieldControlProps,
  ResolvePluginFieldType,
} from "./block-input-control.js";
import { EditorConfigProvider } from "./editor-config-context.js";
import { EditorProvider } from "./provider.js";
import { StylesTab } from "./styles-tab.js";

const i18n = setupI18n({ locale: "en", messages: { en: {} } });
const registry = createBlockRegistry([{ name: "core/x", render: () => null }]);

function markup(
  tree: readonly BlockNode[],
  selection: readonly string[],
  resolvePluginFieldType?: ResolvePluginFieldType,
): string {
  return renderToStaticMarkup(
    <I18nProvider i18n={i18n}>
      <EditorConfigProvider
        registry={registry}
        tokens={{}}
        capabilities={new Set()}
        resolvePluginFieldType={resolvePluginFieldType}
      >
        <EditorProvider
          registry={registry}
          initialTree={tree}
          selection={selection}
        >
          <StylesTab />
        </EditorProvider>
      </EditorConfigProvider>
    </I18nProvider>,
  );
}

function MediaPicker({ testId }: PluginFieldControlProps): ReactElement {
  return <button type="button" data-testid={`${testId}-pick`} />;
}

describe("StylesTab", () => {
  test("shows an empty state when nothing is selected", () => {
    expect(markup([{ id: "a", name: "core/x" }], [])).toContain(
      'data-testid="styles-tab-empty"',
    );
  });

  test("hides the flex controls while the block isn't a flex container", () => {
    expect(markup([{ id: "a", name: "core/x" }], ["a"])).not.toContain(
      'data-testid="style-flexDirection-row"',
    );
  });

  test("reveals the flex controls once the block's display is flex", () => {
    const html = markup(
      [{ id: "a", name: "core/x", style: { large: { display: "flex" } } }],
      ["a"],
    );

    expect(html).toContain('data-testid="style-flexDirection-row"');
  });

  test("the Background section uses the media picker when one is registered", () => {
    const html = markup([{ id: "a", name: "core/x" }], ["a"], (type) =>
      type === "mediaUrl" ? MediaPicker : undefined,
    );

    expect([
      html.includes('data-testid="style-control-backgroundImage-pick"'),
      html.includes('data-testid="style-control-backgroundImage-url"'),
    ]).toEqual([true, false]);
  });

  test("the Background section takes a typed URL without a media picker", () => {
    expect(markup([{ id: "a", name: "core/x" }], ["a"])).toContain(
      'data-testid="style-control-backgroundImage-url"',
    );
  });

  test("a visibility switch reads checked from an existing hidden flag", () => {
    const html = markup(
      [{ id: "a", name: "core/x", hidden: { large: true } }],
      ["a"],
    );

    expect(html).toMatch(
      /aria-checked="true"[^>]*data-state="checked"[^>]*data-testid="style-visibility-desktop"/,
    );
  });
});
