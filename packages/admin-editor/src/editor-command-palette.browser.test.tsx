import type { ReactElement } from "react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import type { BlockNode } from "@plumix/blocks";
import { createBlockRegistry } from "@plumix/blocks";

import { EditorCommandPalette } from "./editor-command-palette.js";
import { EditorConfigProvider } from "./editor-config-context.js";
import { EditorProvider, useEditorStore } from "./provider.js";

beforeAll(() => {
  i18n.loadAndActivate({ locale: "en", messages: {} });
});

afterEach(cleanup);

const registry = createBlockRegistry([
  { name: "core/heading", render: () => null, title: "Heading" },
  { name: "core/group", render: () => null, title: "Group" },
]);

const TREE: readonly BlockNode[] = [
  { id: "one", name: "core/heading", label: "Hero headline" },
];

function StateProbe(): ReactElement {
  const xray = useEditorStore((s) => s.xray);
  const device = useEditorStore((s) => s.device);
  const activeId = useEditorStore((s) => s.activeId);
  return (
    <output data-testid="probe">{`${String(xray)}|${device}|${activeId ?? ""}`}</output>
  );
}

function renderPalette(
  props: Partial<Parameters<typeof EditorCommandPalette>[0]> = {},
): ReturnType<typeof render> {
  return render(
    <I18nProvider i18n={i18n}>
      <EditorConfigProvider
        registry={registry}
        tokens={{}}
        capabilities={new Set()}
      >
        <EditorProvider initialTree={TREE}>
          <EditorCommandPalette {...props} />
          <StateProbe />
        </EditorProvider>
      </EditorConfigProvider>
    </I18nProvider>,
  );
}

const open = (): void => {
  fireEvent.keyDown(window, { key: "k", code: "KeyK", metaKey: true });
};

describe("EditorCommandPalette", () => {
  test("stays closed until Cmd+K asks for it", () => {
    const { queryByTestId } = renderPalette();
    expect(queryByTestId("plumix-command-palette")).toBeNull();
    open();
    expect(queryByTestId("plumix-command-palette")).not.toBeNull();
  });

  test("Ctrl+K opens it too, and Escape closes it", () => {
    const { queryByTestId } = renderPalette();
    fireEvent.keyDown(window, { key: "k", code: "KeyK", ctrlKey: true });
    expect(queryByTestId("plumix-command-palette")).not.toBeNull();
    fireEvent.keyDown(document.activeElement ?? document, { key: "Escape" });
    expect(queryByTestId("plumix-command-palette")).toBeNull();
  });

  test("opens while the author is typing — Cmd+K types nothing", () => {
    const { queryByTestId } = renderPalette();
    const input = document.createElement("input");
    document.body.append(input);
    fireEvent.keyDown(input, { key: "k", code: "KeyK", metaKey: true });
    expect(queryByTestId("plumix-command-palette")).not.toBeNull();
    input.remove();
  });

  test("the chord toggles, as the admin shell's palette does", () => {
    const { queryByTestId } = renderPalette();
    open();
    expect(queryByTestId("plumix-command-palette")).not.toBeNull();
    open();
    expect(queryByTestId("plumix-command-palette")).toBeNull();
  });

  test("running a command applies it and closes the palette", async () => {
    const user = userEvent.setup();
    const { getByTestId, queryByTestId } = renderPalette();
    open();
    await user.click(getByTestId("plumix-command-canvas.xray"));
    expect(getByTestId("probe").textContent).toBe("true|desktop|");
    expect(queryByTestId("plumix-command-palette")).toBeNull();
  });

  test("switches the device from the palette", async () => {
    const user = userEvent.setup();
    const { getByTestId } = renderPalette();
    open();
    await user.click(getByTestId("plumix-command-device.mobile"));
    expect(getByTestId("probe").textContent).toBe("false|mobile|");
  });

  test("filters the list as the author types", async () => {
    const user = userEvent.setup();
    const { getByTestId, queryByTestId } = renderPalette();
    open();
    await user.type(getByTestId("plumix-command-palette-input"), "hero");
    expect(queryByTestId("plumix-command-goto:one")).not.toBeNull();
    expect(queryByTestId("plumix-command-canvas.xray")).toBeNull();
  });

  test("hides group and ungroup when the selection can't take them", () => {
    const { queryByTestId } = renderPalette();
    open();
    expect(queryByTestId("plumix-command-selection.group")).toBeNull();
    expect(queryByTestId("plumix-command-selection.ungroup")).toBeNull();
  });

  test("a go-to command selects its block", async () => {
    const user = userEvent.setup();
    const { getByTestId } = renderPalette();
    open();
    await user.click(getByTestId("plumix-command-goto:one"));
    expect(getByTestId("probe").textContent).toBe("false|desktop|one");
  });

  test("offers the revisions command only when the host wires one", async () => {
    const user = userEvent.setup();
    const onOpenRevisions = vi.fn();
    const { queryByTestId } = renderPalette();
    open();
    expect(queryByTestId("plumix-command-revisions.open")).toBeNull();
    cleanup();

    const view = renderPalette({ onOpenRevisions });
    open();
    const item = view.getByTestId("plumix-command-revisions.open");
    await user.click(item);
    expect(onOpenRevisions).toHaveBeenCalledTimes(1);
  });
});
