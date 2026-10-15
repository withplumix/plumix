import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { BlockNode } from "@plumix/core/blocks";
import { SidebarProvider } from "@plumix/admin-ui/sidebar";

import { treeBlocks } from "../test/tree-blocks.js";
import { deviceLabel, EditorToolbar } from "./editor-toolbar.js";
import { EditorProvider } from "./provider.js";

const i18n = setupI18n({ locale: "en", messages: { en: {} } });

describe("deviceLabel", () => {
  test.each([
    ["desktop", "Desktop"],
    ["tablet", "Tablet"],
    ["mobile", "Mobile"],
  ] as const)("labels the %s device %s", (device, label) => {
    expect(deviceLabel(i18n, device)).toBe(label);
  });
});

function toolbar(hasStarters: boolean, tree: readonly BlockNode[]): string {
  return renderToStaticMarkup(
    <I18nProvider i18n={i18n}>
      <EditorProvider registry={treeBlocks} initialTree={tree}>
        <SidebarProvider>
          <EditorToolbar hasStarters={hasStarters} />
        </SidebarProvider>
      </EditorProvider>
    </I18nProvider>,
  );
}

describe("EditorToolbar", () => {
  test("offers to re-open the starter picker while the canvas is empty", () => {
    expect(toolbar(true, [])).toContain(
      'data-testid="plumix-editor-replace-starter"',
    );
  });

  test("hides the pick-a-starter re-open when there are no starters", () => {
    expect(toolbar(false, [])).not.toContain(
      'data-testid="plumix-editor-replace-starter"',
    );
  });

  test("hides the pick-a-starter re-open once the canvas has blocks", () => {
    expect(
      toolbar(true, [
        { id: "h1", name: "core/heading", attrs: { text: "Hi" } },
      ]),
    ).not.toContain('data-testid="plumix-editor-replace-starter"');
  });
});
