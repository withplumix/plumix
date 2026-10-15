import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { EditorHeaderProps } from "./editor-header.js";
import { treeBlocks } from "../test/tree-blocks.js";
import { EditorHeader } from "./editor-header.js";
import { EditorProvider } from "./provider.js";

const i18n = setupI18n({ locale: "en", messages: { en: {} } });

function markup(props: EditorHeaderProps): string {
  return renderToStaticMarkup(
    <I18nProvider i18n={i18n}>
      <EditorProvider registry={treeBlocks} initialTree={[]}>
        <EditorHeader {...props} />
      </EditorProvider>
    </I18nProvider>,
  );
}

/** The opening tag of the element with `testId`. */
function tagOf(html: string, testId: string): string {
  return (
    new RegExp(`<[^>]*data-testid="${testId}"[^>]*>`).exec(html)?.[0] ?? ""
  );
}

const noop = (): void => undefined;

describe("EditorHeader", () => {
  test("shows a back button when the host handles going back", () => {
    expect(markup({ onBack: noop })).toContain(
      'data-testid="plumix-editor-back"',
    );
  });

  test("shows no back button without a handler", () => {
    expect(markup({})).not.toContain('data-testid="plumix-editor-back"');
  });

  test("a read-only title (no handler) renders as static text", () => {
    const html = markup({ title: "Locked" });

    expect(html).toMatch(/data-testid="plumix-editor-title"[^>]*>Locked</);
    expect(html).not.toContain('data-testid="plumix-editor-title-input"');
  });

  test("while discarding, the Discard and Publish buttons are disabled", () => {
    const html = markup({
      publish: {
        draftMode: {
          hasPendingDraft: true,
          onSaveDraft: noop,
          onPublishDraft: noop,
          onDiscardDraft: noop,
          isSaving: false,
          isPublishing: false,
          isDiscarding: true,
        },
      },
    });

    expect(tagOf(html, "editor-draft-discard")).toContain('disabled=""');
    expect(tagOf(html, "editor-draft-publish")).toContain('disabled=""');
  });
});
