import type { ReactElement, ReactNode } from "react";
import { Profiler, useEffect } from "react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

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

  test("a wheel burst pans live without a render or store commit per event", () => {
    vi.useFakeTimers();
    try {
      let storeApi: ReturnType<typeof useEditorStoreApi> | undefined;
      function Capture(): null {
        const api = useEditorStoreApi();
        useEffect(() => {
          storeApi = api;
        }, [api]);
        return null;
      }
      let renders = 0;
      const { container } = render(
        <I18nProvider i18n={i18n}>
          <EditorProvider>
            <Profiler
              id="cf"
              onRender={() => {
                renders++;
              }}
            >
              <CanvasFrame
                previewUrl="about:blank"
                origin={ORIGIN}
                registry={registry}
                capabilities={NO_CAPS}
              />
            </Profiler>
            <Capture />
          </EditorProvider>
        </I18nProvider>,
      );
      // A geometry report populates the container box the wheel handler needs.
      fromCanvas({ type: "canvas:geometry", rects: [] });

      const canvas = container.querySelector<HTMLElement>(
        '[data-testid="plumix-canvas-frame"]',
      );
      const stage = canvas?.firstElementChild as HTMLElement;
      const before = stage.style.transform;

      renders = 0;
      // A trackpad pan = a burst of wheel events.
      act(() => {
        for (let i = 0; i < 6; i++) {
          canvas?.dispatchEvent(
            new WheelEvent("wheel", {
              deltaY: 20,
              bubbles: true,
              cancelable: true,
            }),
          );
        }
      });

      // The transform moved live (imperative DOM write)...
      expect(stage.style.transform).not.toBe(before);
      // ...but the whole burst caused at most one render (the gesture-start
      // flag), not one per event — and nothing committed to the store yet.
      expect(renders).toBeLessThanOrEqual(1);
      expect(storeApi?.getState().zoomFit).toBe(true);

      // The store commits exactly once when the gesture settles.
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(storeApi?.getState().zoomFit).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  test("an in-canvas add request opens the inserter; a pick inserts at root", () => {
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
    // The empty-document appender forwards a root requestAdd, which opens the
    // inserter popover rather than inserting anything yet.
    fromCanvas({ type: "canvas:requestAdd" });
    expect(getByTestId("plumix-inserter-popover")).toBeDefined();
    expect(getByTestId("tree-probe").textContent).toBe("");

    // Picking a block inserts it at the top level and closes the popover.
    act(() => {
      fireEvent.click(getByTestId("block-catalog-item-core/heading"));
    });
    expect(getByTestId("tree-probe").textContent).toBe("core/heading");
    expect(queryByTestId("plumix-inserter-popover")).toBeNull();
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
    {
      name: "core/button",
      render: () => null,
      category: "interactive",
      title: "Button",
      requiresParent: ["core/buttons"],
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
    act(() =>
      storeApi?.getState().startBlockDrag({
        name: "core/heading",
        slug: "core/heading",
        title: "Heading",
        category: "text",
      }),
    );
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
      readonly BlockNode[] | undefined;
    expect(content?.map((n) => n.name)).toEqual(["core/heading"]);
  });

  test("an in-canvas slot add opens the inserter; a pick nests into that slot", () => {
    renderWith([{ id: "g1", name: "core/group", attrs: { content: [] } }]);

    // The empty slot's appender forwards a slot-scoped requestAdd → the inserter
    // opens scoped to that slot, inserting nothing until a block is picked.
    fromCanvas({
      type: "canvas:requestAdd",
      parentId: "g1",
      slotKey: "content",
    });
    expect(screen.getByTestId("plumix-inserter-popover")).toBeDefined();
    expect(storeApi?.getState().tree[0]?.attrs?.content).toEqual([]);

    act(() => {
      fireEvent.click(screen.getByTestId("block-catalog-item-core/heading"));
    });

    const content = storeApi?.getState().tree[0]?.attrs?.content as
      readonly BlockNode[] | undefined;
    expect(content?.map((n) => n.name)).toEqual(["core/heading"]);
  });

  test("the slot inserter lists only the slot's allowed blocks", () => {
    renderWith([{ id: "b1", name: "core/buttons", attrs: { items: [] } }]);

    fromCanvas({
      type: "canvas:requestAdd",
      parentId: "b1",
      slotKey: "items",
    });

    // items allows only core/button — the heading must not be offered.
    expect(screen.getByTestId("block-catalog-item-core/button")).toBeDefined();
    expect(screen.queryByTestId("block-catalog-item-core/heading")).toBeNull();
  });

  test("refuses a requiresParent block dropped into a non-matching parent", () => {
    renderWith([{ id: "g1", name: "core/group", attrs: { content: [] } }]);

    fromCanvas({
      type: "canvas:geometry",
      rects: [{ id: "g1", x: 0, y: 0, width: 500, height: 500 }],
      slots: [
        {
          parentId: "g1",
          slotKey: "content",
          x: 0,
          y: 0,
          width: 500,
          height: 500,
        },
      ],
    });
    act(() =>
      storeApi?.getState().startBlockDrag({
        name: "core/button",
        slug: "core/button",
        title: "Button",
        category: "interactive",
      }),
    );
    act(() => {
      window.dispatchEvent(
        new MouseEvent("pointermove", { clientX: 50, clientY: 50 }),
      );
      window.dispatchEvent(
        new MouseEvent("pointerup", { clientX: 50, clientY: 50 }),
      );
    });

    // core/button requiresParent core/buttons — the group must refuse it, with
    // a visible notice and no insert.
    expect(storeApi?.getState().tree[0]?.attrs?.content).toEqual([]);
    expect(screen.getByTestId("plumix-add-rejection")).toBeDefined();
  });

  test("a slot rejects a block its allowedBlocks does not permit", () => {
    renderWith([{ id: "b1", name: "core/buttons", attrs: { items: [] } }]);

    dragInto("b1", "items");

    const items = storeApi?.getState().tree[0]?.attrs?.items as
      readonly BlockNode[] | undefined;
    expect(items).toEqual([]);
  });

  // Moving an existing block over a slot, started via the toolbar handle's
  // startMove (the drag origin is host-side, so jsdom can drive it). Top-level
  // reorder needs a real iframe rect for the over-gate; that's e2e-covered.
  const moveInto = (
    movingId: string,
    parentId: string,
    slotKey: string,
  ): void => {
    fromCanvas({
      type: "canvas:geometry",
      rects: [{ id: parentId, x: 0, y: 0, width: 500, height: 500 }],
      slots: [{ parentId, slotKey, x: 0, y: 0, width: 500, height: 500 }],
    });
    act(() => storeApi?.getState().startMove(movingId));
    act(() => {
      window.dispatchEvent(
        new MouseEvent("pointermove", { clientX: 50, clientY: 50 }),
      );
      window.dispatchEvent(
        new MouseEvent("pointerup", { clientX: 50, clientY: 50 }),
      );
    });
  };

  test("dragging an existing block into a slot nests it there", () => {
    renderWith([
      { id: "h", name: "core/heading" },
      { id: "g", name: "core/group", attrs: { content: [] } },
    ]);

    moveInto("h", "g", "content");

    const tree = storeApi?.getState().tree ?? [];
    // h left the top level and now lives in the group's content slot.
    expect(tree.map((n) => n.id)).toEqual(["g"]);
    expect(
      (tree[0]?.attrs?.content as readonly BlockNode[]).map((n) => n.name),
    ).toEqual(["core/heading"]);
  });

  test("a move into a disallowed slot is rejected", () => {
    renderWith([
      { id: "h", name: "core/heading" },
      { id: "b1", name: "core/buttons", attrs: { items: [] } },
    ]);

    moveInto("h", "b1", "items");

    const tree = storeApi?.getState().tree ?? [];
    expect(tree.map((n) => n.id)).toEqual(["h", "b1"]);
    expect(tree[1]?.attrs?.items).toEqual([]);
  });
});

describe("CanvasFrame — drag handle", () => {
  let storeApi: ReturnType<typeof useEditorStoreApi> | undefined;
  function Capture(): null {
    const api = useEditorStoreApi();
    useEffect(() => {
      storeApi = api;
    }, [api]);
    return null;
  }

  test("the frame handle shows the active device label", () => {
    const { getByTestId } = render(
      <Wrapper>
        <CanvasFrame
          previewUrl="about:blank"
          origin={ORIGIN}
          registry={registry}
          capabilities={NO_CAPS}
        />
        <Capture />
      </Wrapper>,
    );

    expect(getByTestId("plumix-canvas-handle").textContent).toBe("Desktop");
    act(() => storeApi?.getState().setDevice("tablet"));
    expect(getByTestId("plumix-canvas-handle").textContent).toBe("Tablet");
  });

  test("the handle is hidden in read-only preview", () => {
    const { queryByTestId } = render(
      <Wrapper>
        <CanvasFrame
          previewUrl="about:blank"
          origin={ORIGIN}
          registry={registry}
          capabilities={NO_CAPS}
          readOnly
        />
      </Wrapper>,
    );

    expect(queryByTestId("plumix-canvas-handle")).toBeNull();
  });
});
