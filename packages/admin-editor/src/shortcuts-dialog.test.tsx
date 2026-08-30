import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

import { EditorProvider } from "./provider.js";
import { MARK_SHORTCUTS } from "./shortcut-display.js";
import { MARK_LABELS, ShortcutsDialog } from "./shortcuts-dialog.js";
import { EDITOR_SHORTCUTS, SHORTCUT_GROUP_IDS } from "./shortcuts.js";

beforeAll(() => {
  i18n.loadAndActivate({ locale: "en", messages: {} });
});

afterEach(cleanup);

function renderDialog(): ReturnType<typeof render> {
  return render(
    <I18nProvider i18n={i18n}>
      <EditorProvider initialTree={[]}>
        <ShortcutsDialog />
      </EditorProvider>
    </I18nProvider>,
  );
}

describe("ShortcutsDialog", () => {
  test("stays closed until a shortcut asks for it", () => {
    const { queryByTestId } = renderDialog();
    expect(queryByTestId("plumix-shortcuts-dialog")).toBeNull();
  });

  test("? opens it", () => {
    const { queryByTestId } = renderDialog();
    fireEvent.keyDown(window, { key: "?", shiftKey: true });
    expect(queryByTestId("plumix-shortcuts-dialog")).not.toBeNull();
  });

  test("Cmd+/ opens it", () => {
    const { queryByTestId } = renderDialog();
    fireEvent.keyDown(window, { key: "/", metaKey: true });
    expect(queryByTestId("plumix-shortcuts-dialog")).not.toBeNull();
  });

  test("neither opens it while the author is typing", () => {
    const { queryByTestId } = renderDialog();
    const input = document.createElement("input");
    document.body.append(input);
    fireEvent.keyDown(input, { key: "?", shiftKey: true });
    fireEvent.keyDown(input, { key: "/", metaKey: true });
    expect(queryByTestId("plumix-shortcuts-dialog")).toBeNull();
    input.remove();
  });

  test("is labelled and dismissible from the keyboard", () => {
    const { queryByTestId } = renderDialog();
    fireEvent.keyDown(window, { key: "?", shiftKey: true });
    expect(queryByTestId("plumix-shortcuts-title")).not.toBeNull();
    fireEvent.keyDown(document.activeElement ?? document, { key: "Escape" });
    expect(queryByTestId("plumix-shortcuts-dialog")).toBeNull();
  });

  test("lists every declared binding, grouped", () => {
    const { queryByTestId } = renderDialog();
    fireEvent.keyDown(window, { key: "?", shiftKey: true });
    for (const shortcut of EDITOR_SHORTCUTS) {
      expect(queryByTestId(`plumix-shortcut-${shortcut.id}`)).not.toBeNull();
    }
    for (const group of SHORTCUT_GROUP_IDS) {
      expect(queryByTestId(`plumix-shortcut-group-${group}`)).not.toBeNull();
    }
  });

  test("lists the formatting bindings the marks declare", () => {
    const { queryByTestId } = renderDialog();
    fireEvent.keyDown(window, { key: "?", shiftKey: true });
    for (const { mark } of MARK_SHORTCUTS) {
      expect(queryByTestId(`plumix-shortcut-mark-${mark}`)).not.toBeNull();
    }
  });

  test("prints the non-Apple modifier names under jsdom", () => {
    const { getByTestId } = renderDialog();
    fireEvent.keyDown(window, { key: "?", shiftKey: true });
    expect(getByTestId("plumix-shortcut-history.redo").textContent).toContain(
      "Ctrl",
    );
    expect(getByTestId("plumix-shortcut-history.redo").textContent).toContain(
      "Shift",
    );
  });
});

describe("MARK_LABELS", () => {
  test("covers every mark that declares a shortcut", () => {
    for (const { mark } of MARK_SHORTCUTS) {
      expect(MARK_LABELS[mark]).toBeDefined();
    }
  });
});
