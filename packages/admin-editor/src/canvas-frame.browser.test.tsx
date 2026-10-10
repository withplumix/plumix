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

import type { BlockNode, BlockSpec } from "@plumix/core/blocks";
import { createBlockRegistry } from "@plumix/core/blocks";
import { EDITOR_BRIDGE_CHANNEL, encode } from "@plumix/core/blocks/renderer";

import { CanvasFrame } from "./canvas-frame.js";
import { EditorConfigProvider } from "./editor-config-context.js";
import {
  EditorProvider,
  useCameraStoreApi,
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
      <EditorConfigProvider
        registry={registry}
        tokens={{}}
        capabilities={NO_CAPS}
      >
        <EditorProvider registry={registry}>{children}</EditorProvider>
      </EditorConfigProvider>
    </I18nProvider>
  );
}

function TreeProbe(): ReactElement {
  const names = useEditorStore((s) => s.tree.map((n) => n.name).join(","));
  return <output data-testid="tree-probe">{names}</output>;
}

describe("CanvasFrame", () => {
  // The iframe fills the stage, and the admin stylesheet sizes the stage from
  // `--box-width`; this tier loads no CSS, so the property is what shows.
  test("sizes the stage around the iframe at the device width", () => {
    const { container } = render(
      <Wrapper>
        <CanvasFrame previewUrl="about:blank" origin={ORIGIN} />
      </Wrapper>,
    );

    const stage = container.querySelector<HTMLElement>(
      '[data-testid="plumix-canvas-stage"]',
    );
    expect(stage?.querySelector("iframe")).not.toBeNull();
    expect(stage?.style.getPropertyValue("--box-width")).toBe("1280px"); // desktop default
  });

  test("reloads the iframe when previewRefreshToken changes, and only then", () => {
    const props = {
      previewUrl: "about:blank",
      origin: ORIGIN,
    };
    const { container, rerender } = render(
      <Wrapper>
        <CanvasFrame {...props} previewRefreshToken={0} />
      </Wrapper>,
    );
    const frame = container.querySelector("iframe");
    if (!frame) throw new Error("expected an iframe");
    // A real `location.reload` is non-configurable, so shadow `contentWindow`;
    // only the reload effect re-reads it on re-render.
    const reload = vi.fn();
    Object.defineProperty(frame, "contentWindow", {
      configurable: true,
      value: { location: { reload } },
    });

    // Title/excerpt/meta live in the shell, so the bridge can't push them —
    // the token bump is the only refresh signal, and mounting isn't one.
    rerender(
      <Wrapper>
        <CanvasFrame {...props} previewRefreshToken={0} />
      </Wrapper>,
    );
    expect(reload).not.toHaveBeenCalled();

    rerender(
      <Wrapper>
        <CanvasFrame {...props} previewRefreshToken={1} />
      </Wrapper>,
    );
    expect(reload).toHaveBeenCalledTimes(1);

    // A re-render at the same token must not reload again.
    rerender(
      <Wrapper>
        <CanvasFrame {...props} previewRefreshToken={1} />
      </Wrapper>,
    );
    expect(reload).toHaveBeenCalledTimes(1);

    rerender(
      <Wrapper>
        <CanvasFrame {...props} previewRefreshToken={2} />
      </Wrapper>,
    );
    expect(reload).toHaveBeenCalledTimes(2);
  });

  test("draws a selection overlay from the canvas's reported geometry", () => {
    const { queryByTestId } = render(
      <Wrapper>
        <CanvasFrame previewUrl="about:blank" origin={ORIGIN} />
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
        <CanvasFrame previewUrl="about:blank" origin={ORIGIN} />
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
        <CanvasFrame previewUrl="about:blank" origin={ORIGIN} />
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

  test("a reveal request pans the block into view without changing the zoom", () => {
    let cameraApi: ReturnType<typeof useCameraStoreApi> | undefined;
    let editorApi: ReturnType<typeof useEditorStoreApi> | undefined;
    function Capture(): null {
      const camera = useCameraStoreApi();
      const editor = useEditorStoreApi();
      useEffect(() => {
        cameraApi = camera;
        editorApi = editor;
      }, [camera, editor]);
      return null;
    }
    const { getByTestId } = render(
      <Wrapper>
        <CanvasFrame previewUrl="about:blank" origin={ORIGIN} />
        <Capture />
      </Wrapper>,
    );
    // A geometry report populates the container box and the block's rect.
    fromCanvas({
      type: "canvas:geometry",
      rects: [{ id: "h1", x: 0, y: 4000, width: 100, height: 40 }],
    });
    const zoom = cameraApi?.getState().zoom ?? 0;
    const viewport = getByTestId("plumix-canvas-frame").getBoundingClientRect();

    // What a palette go-to command does.
    act(() => {
      editorApi?.getState().revealBlock("h1");
    });

    // The block's center (y = 4020) is pulled to the middle of the viewport,
    // whatever height this unstyled render gives it; the zoom is left alone.
    expect(cameraApi?.getState().panY).toBe(viewport.height / 2 - 4020 * zoom);
    expect(cameraApi?.getState().zoom).toBe(zoom);
  });

  test("a wheel burst pans live without a render or store commit per event", () => {
    vi.useFakeTimers();
    try {
      let cameraApi: ReturnType<typeof useCameraStoreApi> | undefined;
      function Capture(): null {
        const api = useCameraStoreApi();
        useEffect(() => {
          cameraApi = api;
        }, [api]);
        return null;
      }
      let renders = 0;
      const { container } = render(
        <I18nProvider i18n={i18n}>
          <EditorConfigProvider
            registry={registry}
            tokens={{}}
            capabilities={NO_CAPS}
          >
            <EditorProvider registry={registry}>
              <Profiler
                id="cf"
                onRender={() => {
                  renders++;
                }}
              >
                <CanvasFrame previewUrl="about:blank" origin={ORIGIN} />
              </Profiler>
              <Capture />
            </EditorProvider>
          </EditorConfigProvider>
        </I18nProvider>,
      );
      // A geometry report populates the container box the wheel handler needs.
      fromCanvas({ type: "canvas:geometry", rects: [] });

      const canvas = container.querySelector<HTMLElement>(
        '[data-testid="plumix-canvas-frame"]',
      );
      const stage = canvas?.firstElementChild as HTMLElement;
      const before = stage.style.getPropertyValue("--stage-transform");

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
      expect(stage.style.getPropertyValue("--stage-transform")).not.toBe(
        before,
      );
      // ...but the whole burst caused at most one render (the gesture-start
      // flag), not one per event — and nothing committed to the store yet.
      expect(renders).toBeLessThanOrEqual(1);
      expect(cameraApi?.getState().fit).toBe(true);

      // The camera commits exactly once when the gesture settles.
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(cameraApi?.getState().fit).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  test("an in-canvas add request opens the inserter; a pick inserts at root", () => {
    const { getByTestId, queryByTestId } = render(
      <Wrapper>
        <CanvasFrame previewUrl="about:blank" origin={ORIGIN} />
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

  test("keeps the inserter open through the open transition", () => {
    const { getByTestId, queryByTestId } = render(
      <Wrapper>
        <CanvasFrame previewUrl="about:blank" origin={ORIGIN} />
      </Wrapper>,
    );

    // An in-iframe click has just moved focus off the host window, which must
    // not trip the dismiss-on-blur listener.
    fromCanvas({ type: "canvas:requestAdd" });
    expect(queryByTestId("plumix-inserter-popover")).not.toBeNull();
    // A re-render (another host message) must also leave it open.
    fromCanvas({ type: "canvas:hover", id: null });
    expect(getByTestId("plumix-inserter-popover")).toBeDefined();
  });

  test("clicking into the canvas iframe dismisses the open inserter", () => {
    const { getByTestId, queryByTestId } = render(
      <Wrapper>
        <CanvasFrame previewUrl="about:blank" origin={ORIGIN} />
      </Wrapper>,
    );

    fromCanvas({ type: "canvas:requestAdd" });
    expect(getByTestId("plumix-inserter-popover")).toBeDefined();

    // Radix only sees outside pointerdowns on the host document; a click in
    // the cross-frame canvas blurs the host window instead.
    act(() => {
      window.dispatchEvent(new Event("blur"));
    });

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
        <EditorConfigProvider
          registry={nestRegistry}
          tokens={{}}
          capabilities={NO_CAPS}
        >
          <EditorProvider registry={nestRegistry} initialTree={tree}>
            <CanvasFrame previewUrl="about:blank" origin={ORIGIN} />
            <Capture />
          </EditorProvider>
        </EditorConfigProvider>
      </I18nProvider>,
    );
  }

  // Slot geometry arrives in canvas document coordinates, so it is offset by
  // the iframe's position in the host page.
  const slotPoint = (): { clientX: number; clientY: number } => {
    const frame = document.querySelector("iframe")?.getBoundingClientRect();
    if (frame === undefined) throw new Error("expected the canvas iframe");
    return { clientX: frame.left + 50, clientY: frame.top + 50 };
  };

  const pointerDrop = (): void => {
    const point = slotPoint();
    act(() => {
      window.dispatchEvent(new MouseEvent("pointermove", point));
      window.dispatchEvent(new MouseEvent("pointerup", point));
    });
  };

  // Drives the catalog-drag pointer sequence over a reported slot region.
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
    pointerDrop();
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
    pointerDrop();

    // core/button requiresParent core/buttons — the group must refuse it, with
    // a visible notice and no insert.
    expect(storeApi?.getState().tree[0]?.attrs?.content).toEqual([]);
    expect(screen.getByTestId("plumix-add-rejection")).toBeDefined();
  });

  test("a slot rejects a block its allowedBlocks does not permit", () => {
    renderWith([{ id: "b1", name: "core/buttons", attrs: { items: [] } }]);

    dragInto("b1", "items");

    // A refusing slot is not a drop target, so the drag resolves to the
    // nearest accepting level.
    const tree = storeApi?.getState().tree ?? [];
    expect(tree.find((n) => n.id === "b1")?.attrs?.items).toEqual([]);
    expect(tree.map((n) => n.name).sort()).toEqual([
      "core/buttons",
      "core/heading",
    ]);
  });

  // Starts a catalog heading drag with the pointer over a core/buttons slot
  // (0..100 in canvas coordinates) that refuses it, inside a 500px block.
  const dragOverRefusingSlot = (): { clientX: number; clientY: number } => {
    fromCanvas({
      type: "canvas:geometry",
      rects: [{ id: "b1", x: 0, y: 0, width: 500, height: 500 }],
      slots: [
        {
          parentId: "b1",
          slotKey: "items",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
        },
      ],
    });
    act(() =>
      storeApi?.getState().startBlockDrag({
        name: "core/heading",
        slug: "core/heading",
        title: "Heading",
        category: "text",
      }),
    );
    const point = slotPoint();
    act(() => {
      window.dispatchEvent(new MouseEvent("pointermove", point));
    });
    return point;
  };

  const REFUSED = "plumix-slot-refused-indicator";

  test("marks the slot under the pointer that refuses the dragged block", () => {
    renderWith([{ id: "b1", name: "core/buttons", attrs: { items: [] } }]);

    dragOverRefusingSlot();

    expect(screen.getByTestId(REFUSED).textContent).toBe(
      "This block can't be placed in this slot.",
    );
    expect(screen.queryByTestId("plumix-slot-drop-indicator")).toBeNull();
  });

  test("an accepting slot shows the drop indicator and no refused mark", () => {
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
          width: 100,
          height: 100,
        },
      ],
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
      window.dispatchEvent(new MouseEvent("pointermove", slotPoint()));
    });

    expect(screen.getByTestId("plumix-slot-drop-indicator")).toBeDefined();
    expect(screen.queryByTestId(REFUSED)).toBeNull();
  });

  test("the refused mark clears once the pointer leaves the slot", () => {
    renderWith([{ id: "b1", name: "core/buttons", attrs: { items: [] } }]);

    const point = dragOverRefusingSlot();
    act(() => {
      window.dispatchEvent(
        new MouseEvent("pointermove", {
          clientX: point.clientX + 250,
          clientY: point.clientY + 250,
        }),
      );
    });

    expect(screen.queryByTestId(REFUSED)).toBeNull();
  });

  test.each([
    [
      "pointer-up",
      (point: MouseEventInit) => new MouseEvent("pointerup", point),
    ],
    ["pointercancel", () => new MouseEvent("pointercancel")],
    [
      "the cancel-drag shortcut",
      () => new KeyboardEvent("keydown", { key: "Escape" }),
    ],
  ])("the refused mark clears when the drag ends on %s", (_, end) => {
    renderWith([{ id: "b1", name: "core/buttons", attrs: { items: [] } }]);

    const point = dragOverRefusingSlot();
    expect(screen.getByTestId(REFUSED)).toBeDefined();
    act(() => {
      window.dispatchEvent(end(point));
    });

    expect(screen.queryByTestId(REFUSED)).toBeNull();
  });

  // Moving an existing block over a slot, started via the toolbar handle's
  // startMove (the drag origin is host-side, so the test can drive it).
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
    pointerDrop();
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
        <CanvasFrame previewUrl="about:blank" origin={ORIGIN} />
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
        <CanvasFrame previewUrl="about:blank" origin={ORIGIN} readOnly />
      </Wrapper>,
    );

    expect(queryByTestId("plumix-canvas-handle")).toBeNull();
  });
});
