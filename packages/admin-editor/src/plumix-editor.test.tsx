import type { ReactElement } from "react";
import { useEffect } from "react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import type { EntryContent } from "@plumix/blocks";
import { createBlockRegistry } from "@plumix/blocks";

import { PlumixEditor, TreeChangeEmitter } from "./plumix-editor.js";
import { EditorProvider, useEditorStoreApi } from "./provider.js";

beforeAll(() => {
  i18n.loadAndActivate({ locale: "en", messages: {} });
});

afterEach(cleanup);

const registry = createBlockRegistry([
  { name: "core/heading", render: () => null },
]);

function renderEditor(): ReturnType<typeof render> {
  return render(
    <I18nProvider i18n={i18n}>
      <PlumixEditor
        previewUrl="about:blank"
        origin="http://localhost:3000"
        defaultValue={{ version: "plumix.v2", blocks: [] }}
        registry={registry}
        documentPanel={<div data-testid="doc-panel">document settings</div>}
      />
    </I18nProvider>,
  );
}

describe("PlumixEditor", () => {
  test("mounts the canvas for the given preview URL", () => {
    const { getByTestId, container } = renderEditor();
    expect(getByTestId("plumix-canvas-frame")).toBeDefined();
    expect(container.querySelector("iframe")?.getAttribute("src")).toBe(
      "about:blank",
    );
  });

  test("mounts the right-rail inspector with Block/Page/JSON tabs", () => {
    const { getByTestId } = renderEditor();
    expect(getByTestId("plumix-editor-right")).toBeDefined();
    expect(getByTestId("plumix-tab-block")).toBeDefined();
    expect(getByTestId("plumix-tab-page")).toBeDefined();
    expect(getByTestId("plumix-tab-json")).toBeDefined();
    // Block tab is active by default → inspector empty state shows.
    expect(getByTestId("block-inspector-empty")).toBeDefined();
  });
});

describe("TreeChangeEmitter", () => {
  test("emits the content envelope when the tree changes", () => {
    const onChange = vi.fn<(content: EntryContent) => void>();
    let select: (() => void) | undefined;

    function Mutator(): ReactElement | null {
      const api = useEditorStoreApi();
      useEffect(() => {
        select = () =>
          api.getState().setTree([{ id: "h1", name: "core/heading" }]);
      }, [api]);
      return null;
    }

    render(
      <EditorProvider initialTree={[]}>
        <TreeChangeEmitter onChange={onChange} />
        <Mutator />
      </EditorProvider>,
    );

    expect(onChange).not.toHaveBeenCalled();
    act(() => select?.());

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      version: "plumix.v2",
      blocks: [{ id: "h1", name: "core/heading" }],
    });
  });
});
