import { useEffect } from "react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

import type { BlockNode } from "@plumix/blocks";

import type { InserterPattern } from "./block-catalog.js";
import { EditorProvider, useEditorStoreApi } from "./provider.js";
import { StarterModal } from "./starter-modal.js";

beforeAll(() => {
  i18n.loadAndActivate({ locale: "en", messages: {} });
});

afterEach(cleanup);

const hero: InserterPattern = {
  name: "starter/hero",
  title: "Hero start",
  target: "post-content",
  content: [{ id: "p", name: "core/heading", attrs: { text: "Hi" } }],
};

const cta: InserterPattern = {
  name: "starter/cta",
  title: "CTA start",
  target: "post-content",
  content: [{ id: "p", name: "core/paragraph", attrs: { text: "Go" } }],
};

let storeApi: ReturnType<typeof useEditorStoreApi> | undefined;
function Capture(): null {
  const api = useEditorStoreApi();
  useEffect(() => {
    storeApi = api;
  }, [api]);
  return null;
}

function renderModal(
  candidates: readonly InserterPattern[],
  tree: readonly BlockNode[] = [],
): ReturnType<typeof render> {
  storeApi = undefined;
  return render(
    <I18nProvider i18n={i18n}>
      <EditorProvider initialTree={tree} starterOpen={candidates.length > 0}>
        <Capture />
        <StarterModal candidates={candidates} />
      </EditorProvider>
    </I18nProvider>,
  );
}

describe("StarterModal", () => {
  test("renders nothing when there are no candidates", () => {
    const { queryByTestId } = renderModal([]);
    expect(queryByTestId("plumix-starter-modal")).toBeNull();
  });

  test("renders one card per candidate plus a Start-from-blank action", () => {
    const { getByTestId } = renderModal([hero, cta]);
    expect(getByTestId("plumix-starter-modal")).toBeDefined();
    expect(getByTestId("plumix-starter-modal-card-starter/hero")).toBeDefined();
    expect(getByTestId("plumix-starter-modal-card-starter/cta")).toBeDefined();
    expect(getByTestId("plumix-starter-modal-start-blank")).toBeDefined();
  });

  test("choosing a card seeds its content and closes the modal", () => {
    const { getByTestId, queryByTestId } = renderModal([hero, cta]);

    fireEvent.click(getByTestId("plumix-starter-modal-card-starter/cta"));

    const tree = storeApi?.getState().tree ?? [];
    expect(tree.map((n) => n.name)).toEqual(["core/paragraph"]);
    // Fresh ids are minted on insert — the pattern's placeholder id is gone.
    expect(tree[0]?.id).not.toBe("p");
    expect(storeApi?.getState().starterOpen).toBe(false);
    expect(queryByTestId("plumix-starter-modal")).toBeNull();
  });

  test("Start from blank closes the modal without seeding content", () => {
    const { getByTestId, queryByTestId } = renderModal([hero]);

    fireEvent.click(getByTestId("plumix-starter-modal-start-blank"));

    expect(storeApi?.getState().tree).toEqual([]);
    expect(storeApi?.getState().starterOpen).toBe(false);
    expect(queryByTestId("plumix-starter-modal")).toBeNull();
  });
});
