import { useEffect } from "react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { SidebarProvider } from "@plumix/admin-ui/sidebar";

import { EditorShortcuts, EditorToolbar } from "./editor-toolbar.js";
import { EditorProvider, useEditorStoreApi } from "./provider.js";

beforeAll(() => {
  i18n.loadAndActivate({ locale: "en", messages: {} });
});

afterEach(cleanup);

// Exposes the store so a test can drive edits the toolbar reacts to.
let storeApi: ReturnType<typeof useEditorStoreApi> | undefined;
function Capture(): null {
  const api = useEditorStoreApi();
  useEffect(() => {
    storeApi = api;
  }, [api]);
  return null;
}

function renderToolbar(
  publish?: Parameters<typeof EditorToolbar>[0]["publish"],
): ReturnType<typeof render> {
  return render(
    <I18nProvider i18n={i18n}>
      <EditorProvider initialTree={[]}>
        <SidebarProvider>
          <EditorToolbar publish={publish} />
        </SidebarProvider>
        <EditorShortcuts />
        <Capture />
      </EditorProvider>
    </I18nProvider>,
  );
}

describe("EditorToolbar", () => {
  const button = (el: HTMLElement): HTMLButtonElement =>
    el as HTMLButtonElement;

  test("undo/redo start disabled", () => {
    const { getByTestId } = renderToolbar();
    expect(button(getByTestId("plumix-undo")).disabled).toBe(true);
    expect(button(getByTestId("plumix-redo")).disabled).toBe(true);
  });

  test("undo enables after an edit and reverts it on click", () => {
    const { getByTestId } = renderToolbar();
    act(() => storeApi?.getState().insertBlock({ id: "a", name: "core/x" }, 0));

    const undoButton = getByTestId("plumix-undo");
    expect(button(undoButton).disabled).toBe(false);
    fireEvent.click(undoButton);

    expect(storeApi?.getState().tree).toHaveLength(0);
    expect(button(getByTestId("plumix-redo")).disabled).toBe(false);
  });

  test("Ctrl/Cmd+Z undoes via the keyboard", () => {
    renderToolbar();
    storeApi?.getState().insertBlock({ id: "a", name: "core/x" }, 0);

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(storeApi?.getState().tree).toHaveLength(0);

    fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
    expect(storeApi?.getState().tree).toHaveLength(1);
  });

  test("does not hijack undo while typing in a field", () => {
    renderToolbar();
    storeApi?.getState().insertBlock({ id: "a", name: "core/x" }, 0);

    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: "z", ctrlKey: true });
    // The edit survives — the shortcut deferred to the field's native undo.
    expect(storeApi?.getState().tree).toHaveLength(1);
    input.remove();
  });

  test("renders a Publish button that calls onPublish", () => {
    const onPublish = vi.fn();
    const { getByTestId } = renderToolbar({ onPublish, isPublished: false });
    const publishButton = getByTestId("plumix-editor-publish-button");
    expect(button(publishButton).disabled).toBe(false);
    fireEvent.click(publishButton);
    expect(onPublish).toHaveBeenCalledOnce();
  });

  test("the Publish button is disabled once published", () => {
    const { getByTestId } = renderToolbar({
      onPublish: vi.fn(),
      isPublished: true,
    });
    expect(button(getByTestId("plumix-editor-publish-button")).disabled).toBe(
      true,
    );
  });

  test("draft mode shows save/publish/discard, gated on a pending draft", () => {
    const draftMode = {
      hasPendingDraft: false,
      onSaveDraft: vi.fn(),
      onPublishDraft: vi.fn(),
      onDiscardDraft: vi.fn(),
      isSaving: false,
      isPublishing: false,
      isDiscarding: false,
    };
    const { getByTestId, queryByTestId } = renderToolbar({ draftMode });
    // No live Publish button in draft mode.
    expect(queryByTestId("plumix-editor-publish-button")).toBeNull();
    // Discard + Publish gated until there's a pending draft; Save always on.
    expect(button(getByTestId("editor-draft-save")).disabled).toBe(false);
    expect(button(getByTestId("editor-draft-discard")).disabled).toBe(true);
    expect(button(getByTestId("editor-draft-publish")).disabled).toBe(true);
    expect(queryByTestId("unpublished-changes-banner")).toBeNull();
  });

  test("a preview link surfaces a copy-to-clipboard action", () => {
    const writeText = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const { getByTestId, queryByTestId } = render(
      <I18nProvider i18n={i18n}>
        <EditorProvider initialTree={[]}>
          <SidebarProvider>
            <EditorToolbar previewLink="https://x.test/blog/hi?preview=tok" />
          </SidebarProvider>
        </EditorProvider>
      </I18nProvider>,
    );
    fireEvent.click(getByTestId("plumix-copy-preview-link"));
    expect(writeText).toHaveBeenCalledWith(
      "https://x.test/blog/hi?preview=tok",
    );
    vi.unstubAllGlobals();
    // No link → no action.
    cleanup();
    render(
      <I18nProvider i18n={i18n}>
        <EditorProvider initialTree={[]}>
          <SidebarProvider>
            <EditorToolbar />
          </SidebarProvider>
        </EditorProvider>
      </I18nProvider>,
    );
    expect(queryByTestId("plumix-copy-preview-link")).toBeNull();
  });

  test("a pending draft enables discard/publish and shows the banner", () => {
    const draftMode = {
      hasPendingDraft: true,
      onSaveDraft: vi.fn(),
      onPublishDraft: vi.fn(),
      onDiscardDraft: vi.fn(),
      isSaving: false,
      isPublishing: false,
      isDiscarding: false,
    };
    const { getByTestId } = renderToolbar({ draftMode });
    expect(getByTestId("unpublished-changes-banner")).toBeDefined();
    fireEvent.click(getByTestId("editor-draft-publish"));
    expect(draftMode.onPublishDraft).toHaveBeenCalledOnce();
  });
});
