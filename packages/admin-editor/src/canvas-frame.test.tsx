import type { ReactElement, ReactNode } from "react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

import { createBlockRegistry } from "@plumix/blocks";
import { EDITOR_BRIDGE_CHANNEL, encode } from "@plumix/blocks/renderer";

import { CanvasFrame } from "./canvas-frame.js";
import { EditorProvider, useEditorStore } from "./provider.js";

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
