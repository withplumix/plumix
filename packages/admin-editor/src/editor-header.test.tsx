import { useEffect } from "react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import type { EditorHeaderProps } from "./editor-header.js";
import { EditorHeader } from "./editor-header.js";
import { EditorProvider, useEditorStoreApi } from "./provider.js";

beforeAll(() => {
  i18n.loadAndActivate({ locale: "en", messages: {} });
});
afterEach(cleanup);

let storeApi: ReturnType<typeof useEditorStoreApi> | undefined;
function Capture(): null {
  const api = useEditorStoreApi();
  useEffect(() => {
    storeApi = api;
  }, [api]);
  return null;
}

function renderHeader(
  props: EditorHeaderProps = {},
): ReturnType<typeof render> {
  return render(
    <I18nProvider i18n={i18n}>
      <EditorProvider initialTree={[]}>
        <EditorHeader {...props} />
        <Capture />
      </EditorProvider>
    </I18nProvider>,
  );
}

const button = (el: HTMLElement): HTMLButtonElement => el as HTMLButtonElement;

describe("EditorHeader", () => {
  test("the back button calls onBack; absent without the handler", () => {
    const onBack = vi.fn();
    const { getByTestId, queryByTestId, rerender } = renderHeader({ onBack });
    fireEvent.click(getByTestId("plumix-editor-back"));
    expect(onBack).toHaveBeenCalledOnce();

    rerender(
      <I18nProvider i18n={i18n}>
        <EditorProvider initialTree={[]}>
          <EditorHeader />
        </EditorProvider>
      </I18nProvider>,
    );
    expect(queryByTestId("plumix-editor-back")).toBeNull();
  });

  test("editing the title input calls onTitleChange", () => {
    const onTitleChange = vi.fn();
    const { getByTestId } = renderHeader({ title: "Hi", onTitleChange });
    fireEvent.change(getByTestId("plumix-editor-title-input"), {
      target: { value: "Hello" },
    });
    expect(onTitleChange).toHaveBeenCalledWith("Hello");
  });

  test("a read-only title (no handler) renders as static text", () => {
    const { getByTestId, queryByTestId } = renderHeader({ title: "Locked" });
    expect(getByTestId("plumix-editor-title").textContent).toBe("Locked");
    expect(queryByTestId("plumix-editor-title-input")).toBeNull();
  });

  test("undo/redo start disabled and enable after an edit", () => {
    const { getByTestId } = renderHeader();
    expect(button(getByTestId("plumix-undo")).disabled).toBe(true);
    expect(button(getByTestId("plumix-redo")).disabled).toBe(true);

    act(() => storeApi?.getState().insertBlock({ id: "a", name: "core/x" }, 0));
    expect(button(getByTestId("plumix-undo")).disabled).toBe(false);
  });

  test("the preview menu trigger renders", () => {
    // The menu items' open/disabled behavior is exercised in the browser; Radix
    // menus don't open reliably under jsdom.
    const { getByTestId } = renderHeader({
      previewLink: "https://x.test/p?preview=tok",
    });
    expect(getByTestId("plumix-preview-menu")).toBeDefined();
  });

  test("the source-code button opens the JSON source dialog", () => {
    const { getByTestId } = renderHeader();
    expect(storeApi?.getState().jsonOpen).toBe(false);
    fireEvent.click(getByTestId("plumix-view-source"));
    expect(storeApi?.getState().jsonOpen).toBe(true);
  });

  test("the Publish button calls onPublish", () => {
    const onPublish = vi.fn();
    const { getByTestId } = renderHeader({
      publish: { onPublish, isPublished: false },
    });
    fireEvent.click(getByTestId("plumix-editor-publish-button"));
    expect(onPublish).toHaveBeenCalledOnce();
  });

  function draftMode(
    overrides: Partial<
      NonNullable<EditorHeaderProps["publish"]>["draftMode"]
    > = {},
  ): EditorHeaderProps["publish"] {
    return {
      draftMode: {
        hasPendingDraft: true,
        onSaveDraft: vi.fn(),
        onPublishDraft: vi.fn(),
        onDiscardDraft: vi.fn(),
        isSaving: false,
        isPublishing: false,
        isDiscarding: false,
        ...overrides,
      },
    };
  }

  test("a pending draft shows the unpublished-changes indicator and Discard", () => {
    const onDiscardDraft = vi.fn();
    const { getByTestId } = renderHeader({
      publish: draftMode({ onDiscardDraft }),
    });
    expect(getByTestId("editor-unpublished-changes")).toBeDefined();
    fireEvent.click(getByTestId("editor-draft-discard"));
    expect(onDiscardDraft).toHaveBeenCalledOnce();
  });

  test("with a pending draft, Publish calls onPublishDraft", () => {
    const onPublishDraft = vi.fn();
    const { getByTestId } = renderHeader({
      publish: draftMode({ onPublishDraft }),
    });
    fireEvent.click(getByTestId("editor-draft-publish"));
    expect(onPublishDraft).toHaveBeenCalledOnce();
  });

  test("no pending draft hides the indicator and Discard, and disables Publish", () => {
    const { getByTestId, queryByTestId } = renderHeader({
      publish: draftMode({ hasPendingDraft: false }),
    });
    expect(queryByTestId("editor-unpublished-changes")).toBeNull();
    expect(queryByTestId("editor-draft-discard")).toBeNull();
    expect(button(getByTestId("editor-draft-publish")).disabled).toBe(true);
  });

  test("while discarding, the Discard and Publish buttons are disabled", () => {
    const { getByTestId } = renderHeader({
      publish: draftMode({ isDiscarding: true }),
    });
    expect(button(getByTestId("editor-draft-discard")).disabled).toBe(true);
    expect(button(getByTestId("editor-draft-publish")).disabled).toBe(true);
  });

  test("renders the revisions trigger slot when provided; absent otherwise", () => {
    const { getByTestId, queryByTestId, rerender } = renderHeader({
      revisionsTrigger: <button data-testid="my-revisions">Revisions</button>,
    });
    expect(getByTestId("my-revisions")).toBeDefined();

    rerender(
      <I18nProvider i18n={i18n}>
        <EditorProvider initialTree={[]}>
          <EditorHeader />
        </EditorProvider>
      </I18nProvider>,
    );
    expect(queryByTestId("my-revisions")).toBeNull();
  });
});
