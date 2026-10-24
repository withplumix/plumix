import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { BlockNode } from "@plumix/core/blocks";

import { treeBlocks } from "../test/tree-blocks.js";
import { EditorConfigProvider } from "./editor-config-context.js";
import { EditorProvider } from "./provider.js";
import { SelectionToolbar } from "./selection-toolbar.js";

const i18n = setupI18n({ locale: "en", messages: { en: {} } });

const TREE: readonly BlockNode[] = [
  {
    id: "g",
    name: "core/group",
    attrs: { content: [{ id: "a", name: "acme/team" }] },
  },
  { id: "o", name: "acme/gone" },
];

function markup(selection: readonly string[]): string {
  return renderToStaticMarkup(
    <I18nProvider i18n={i18n}>
      <EditorConfigProvider
        registry={treeBlocks}
        tokens={{}}
        capabilities={new Set()}
      >
        <EditorProvider
          registry={treeBlocks}
          initialTree={TREE}
          selection={selection}
        >
          <SelectionToolbar
            box={{ left: 10, top: 20, width: 100, height: 40 }}
          />
        </EditorProvider>
      </EditorConfigProvider>
    </I18nProvider>,
  );
}

/** The opening tag of the element with `testId`. */
function tagOf(html: string, testId: string): string {
  return (
    new RegExp(`<[^>]*data-testid="${testId}"[^>]*>`).exec(html)?.[0] ?? ""
  );
}

describe("SelectionToolbar", () => {
  // The tooltip shows the label but doesn't name its trigger; aria-label does.
  test.each([
    ["selection-toolbar-drag", "Drag to move"],
    ["selection-toolbar-select-parent", "Select parent"],
    ["selection-toolbar-move-up", "Move up"],
    ["selection-toolbar-move-down", "Move down"],
    ["selection-toolbar-group", "Group"],
    ["selection-toolbar-duplicate", "Duplicate"],
    ["selection-toolbar-delete", "Delete"],
  ])("%s is named %s", (testId, name) => {
    expect(tagOf(markup(["a"]), testId)).toContain(`aria-label="${name}"`);
  });

  test("renders nothing until a block is active", () => {
    expect(markup([])).not.toContain('data-testid="plumix-selection-toolbar"');
  });

  test("select-parent is disabled for a top-level block", () => {
    expect(tagOf(markup(["g"]), "selection-toolbar-select-parent")).toContain(
      'disabled=""',
    );
  });

  test("select-parent is enabled for a nested block", () => {
    expect(
      tagOf(markup(["a"]), "selection-toolbar-select-parent"),
    ).not.toContain('disabled=""');
  });

  test("offers no duplicate for a block this site doesn't register", () => {
    const html = markup(["o"]);

    expect(html).not.toContain('data-testid="selection-toolbar-duplicate"');
    expect(html).toContain('data-testid="selection-toolbar-delete"');
    expect(html).toContain('data-testid="selection-toolbar-move-up"');
  });

  test("offers no duplicate for a selection that holds one", () => {
    expect(markup(["a", "o"])).not.toContain(
      'data-testid="selection-toolbar-duplicate"',
    );
  });
});
