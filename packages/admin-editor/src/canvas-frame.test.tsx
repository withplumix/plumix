import type { ReactElement, ReactNode } from "react";
import { useEffect } from "react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

import type { BlockNode, BlockSpec } from "@plumix/blocks";
import { createBlockRegistry } from "@plumix/blocks";
import { EDITOR_BRIDGE_CHANNEL, encode } from "@plumix/blocks/renderer";

import { CanvasFrame } from "./canvas-frame.js";
import {
  EditorProvider,
  useEditorStore,
  useEditorStoreApi,
} from "./provider.js";

const ORIGIN = "http://localhost:3000";

const registry = createBlockRegistry([
  {
    name: "core/heading",
    render: () => null,
    category: "text",
    title: "Heading",
  },
]);
const NO_CAPS: ReadonlySet<string> = new Set();

beforeAll(() => {
  i18n.loadAndActivate({ locale: "en", messages: {} });
});

afterEach(cleanup);

function fromCanvas(message: unknown): void {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: encode(EDITOR_BRIDGE_CHANNEL, message),
        origin: ORIGIN,
      }),
    );
  });
}

function Wrapper({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <I18nProvider i18n={i18n}>
      <EditorProvider>{children}</EditorProvider>
    </I18nProvider>
  );
}

function TreeProbe(): ReactElement {
  const names = useEditorStore((s) => s.tree.map((n) => n.name).join(","));
  return <output data-testid="tree-probe">{names}</output>;
}

describe("CanvasFrame", () => {
  test("renders the iframe at the device width", () => {
    const { container } = render(
      <Wrapper>
        <CanvasFrame
          previewUrl="about:blank"
          origin={ORIGIN}
          registry={registry}
          capabilities={NO_CAPS}
        />
      </Wrapper>,
    );

    const iframe = container.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.style.width).toBe("1280px"); // desktop default
  });

  test("draws a selection overlay from the canvas's reported geometry", () => {
    const { queryByTestId } = render(
      <Wrapper>
        <CanvasFrame
          previewUrl="about:blank"
          origin={ORIGIN}
          registry={registry}
          capabilities={NO_CAPS}
        />
      </Wrapper>,
    );

    fromCanvas({ type: "canvas:select", id: "h1" });
    fromCanvas({
      type: "canvas:geometry",
      rects: [{ id: "h1", x: 10, y: 20, width: 100, height: 40 }],
    });

    expect(queryByTestId("plumix-overlay-selected")).not.toBeNull();
  });

  test("outlines every selected block, marking the active one apart", () => {
    const { queryByTestId } = render(
      <Wrapper>
        <CanvasFrame
          previewUrl="about:blank"
          origin={ORIGIN}
          registry={registry}
          capabilities={NO_CAPS}
        />
      </Wrapper>,
    );

    fromCanvas({ type: "canvas:select", id: "h1" });
    fromCanvas({ type: "canvas:select", id: "h2", additive: true });
    fromCanvas({
      type: "canvas:geometry",
      rects: [
        { id: "h1", x: 10, y: 20, width: 100, height: 40 },
        { id: "h2", x: 10, y: 80, width: 100, height: 40 },
      ],
    });

    // h2 is the active block (strong outline); h1 is a non-active member.
    expect(queryByTestId("plumix-overlay-selected")).not.toBeNull();
    expect(queryByTestId("plumix-overlay-member-h1")).not.toBeNull();
    expect(queryByTestId("plumix-overlay-member-h2")).toBeNull();
  });

  test("floats the selection toolbar over the active block", () => {
    const { queryByTestId } = render(
      <Wrapper>
        <CanvasFrame
          previewUrl="about:blank"
          origin={ORIGIN}
          registry={registry}
          capabilities={NO_CAPS}
        />
      </Wrapper>,
    );

    // No active block yet — no toolbar.
    expect(queryByTestId("plumix-selection-toolbar")).toBeNull();

    fromCanvas({ type: "canvas:select", id: "h1" });
    fromCanvas({
      type: "canvas:geometry",
      rects: [{ id: "h1", x: 10, y: 20, width: 100, height: 40 }],
    });

    expect(queryByTestId("plumix-selection-toolbar")).not.toBeNull();
  });

  test("empty-state affordance inserts the first catalog block", () => {
    const { getByTestId, queryByTestId } = render(
      <Wrapper>
        <CanvasFrame
          previewUrl="about:blank"
          origin={ORIGIN}
          registry={registry}
          capabilities={NO_CAPS}
        />
        <TreeProbe />
      </Wrapper>,
    );

    expect(getByTestId("tree-probe").textContent).toBe("");
    fireEvent.click(getByTestId("plumix-empty-add"));
    expect(getByTestId("tree-probe").textContent).toBe("core/heading");
    // Affordance disappears once the canvas is no longer empty.
    expect(queryByTestId("plumix-empty-add")).toBeNull();
  });
});

describe("CanvasFrame nested drop", () => {
  const headingSpec: BlockSpec = {
    name: "core/heading",
    render: () => null,
    title: "Heading",
    category: "text",
  };
  const nestRegistry = createBlockRegistry([
    headingSpec,
    {
      name: "core/group",
      render: () => null,
      inputs: [{ name: "content", type: "slot", label: "Content" }],
    },
    {
      name: "core/buttons",
      render: () => null,
      inputs: [
        {
          name: "items",
          type: "slot",
          label: "Buttons",
          allowedBlocks: ["core/button"],
        },
      ],
    },
  ]);

  let storeApi: ReturnType<typeof useEditorStoreApi> | undefined;
  function Capture(): null {
    const api = useEditorStoreApi();
    useEffect(() => {
      storeApi = api;
    }, [api]);
    return null;
  }

  function renderWith(tree: readonly BlockNode[]): void {
    render(
      <I18nProvider i18n={i18n}>
        <EditorProvider initialTree={tree}>
          <CanvasFrame
            previewUrl="about:blank"
            origin={ORIGIN}
            registry={nestRegistry}
            capabilities={NO_CAPS}
          />
          <Capture />
        </EditorProvider>
      </I18nProvider>,
    );
  }

  // Drives the catalog-drag pointer sequence over a reported slot region. jsdom
  // gives the iframe a zero origin, so a slot rect at (0,0,500,500) maps 1:1 to
  // screen and a pointer at (50,50) lands inside it.
  const dragInto = (parentId: string, slotKey: string): void => {
    fromCanvas({
      type: "canvas:geometry",
      rects: [{ id: parentId, x: 0, y: 0, width: 500, height: 500 }],
      slots: [{ parentId, slotKey, x: 0, y: 0, width: 500, height: 500 }],
    });
    act(() => storeApi?.getState().startBlockDrag(headingSpec));
    act(() => {
      window.dispatchEvent(
        new MouseEvent("pointermove", { clientX: 50, clientY: 50 }),
      );
      window.dispatchEvent(
        new MouseEvent("pointerup", { clientX: 50, clientY: 50 }),
      );
    });
  };

  test("dropping a dragged block into a slot region nests it there", () => {
    renderWith([{ id: "g1", name: "core/group", attrs: { content: [] } }]);

    dragInto("g1", "content");

    const content = storeApi?.getState().tree[0]?.attrs?.content as
      | readonly BlockNode[]
      | undefined;
    expect(content?.map((n) => n.name)).toEqual(["core/heading"]);
  });

  test("a slot rejects a block its allowedBlocks does not permit", () => {
    renderWith([{ id: "b1", name: "core/buttons", attrs: { items: [] } }]);

    dragInto("b1", "items");

    const items = storeApi?.getState().tree[0]?.attrs?.items as
      | readonly BlockNode[]
      | undefined;
    expect(items).toEqual([]);
  });
});
