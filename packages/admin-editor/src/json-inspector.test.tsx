import { useEffect } from "react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import {
  cleanup,
  findByTestId,
  fireEvent,
  render,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

import type { BlockNode } from "@plumix/blocks";

import { JsonInspector, JsonSourceDialog } from "./json-inspector.js";
import { EditorProvider, useEditorStoreApi } from "./provider.js";

beforeAll(() => {
  i18n.loadAndActivate({ locale: "en", messages: {} });
});

afterEach(cleanup);

const TREE: readonly BlockNode[] = [
  { id: "h1", name: "core/heading", attrs: { text: "Hi" } },
  { id: "s1", name: "core/spacer" },
];

// Selects a block on mount so the block view has something to show.
function Selector({ id }: { readonly id?: string }): null {
  const api = useEditorStoreApi();
  useEffect(() => {
    if (id) api.getState().select(id);
  }, [id, api]);
  return null;
}

function renderInspector(selectId?: string): ReturnType<typeof render> {
  return render(
    <I18nProvider i18n={i18n}>
      <EditorProvider initialTree={TREE}>
        <Selector id={selectId} />
        <JsonInspector />
      </EditorProvider>
    </I18nProvider>,
  );
}

describe("JsonInspector", () => {
  test("shows the whole-page JSON by default", () => {
    const { getByTestId } = renderInspector();
    const output = getByTestId("json-inspector-output").textContent;
    expect(output).toContain('"h1"');
    expect(output).toContain('"s1"');
  });

  test("toggles to the selected block's JSON", () => {
    const { getByTestId } = renderInspector("h1");
    fireEvent.click(getByTestId("json-inspector-toggle-block"));
    const output = getByTestId("json-inspector-output").textContent;
    expect(output).toContain('"h1"');
    // The other block is not in the single-block view.
    expect(output).not.toContain('"s1"');
  });

  test("block view prompts when nothing is selected", () => {
    const { getByTestId, queryByTestId } = renderInspector();
    fireEvent.click(getByTestId("json-inspector-toggle-block"));
    expect(getByTestId("json-inspector-empty")).toBeDefined();
    expect(queryByTestId("json-inspector-output")).toBeNull();
  });
});

// Opens the source dialog on mount so its (portalled) content renders.
function Opener(): null {
  const api = useEditorStoreApi();
  useEffect(() => {
    api.getState().setJsonOpen(true);
  }, [api]);
  return null;
}

describe("JsonSourceDialog", () => {
  test("renders the page tree once the store opens it", async () => {
    render(
      <I18nProvider i18n={i18n}>
        <EditorProvider initialTree={TREE}>
          <Opener />
          <JsonSourceDialog />
        </EditorProvider>
      </I18nProvider>,
    );
    // Dialog content is portalled to the body, not the render container.
    const output = await findByTestId(document.body, "json-inspector-output");
    expect(output.textContent).toContain('"h1"');
  });
});
