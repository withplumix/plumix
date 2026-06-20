import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { EDITOR_BRIDGE_CHANNEL, encode } from "@plumix/blocks/renderer";

import { CanvasFrame } from "./canvas-frame.js";
import { EditorProvider } from "./provider.js";

const ORIGIN = "http://localhost:3000";

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

describe("CanvasFrame", () => {
  test("renders the iframe at the device width", () => {
    const { container } = render(
      <EditorProvider>
        <CanvasFrame previewUrl="about:blank" origin={ORIGIN} />
      </EditorProvider>,
    );

    const iframe = container.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.style.width).toBe("1280px"); // desktop default
  });

  test("draws a selection overlay from the canvas's reported geometry", () => {
    const { queryByTestId } = render(
      <EditorProvider>
        <CanvasFrame previewUrl="about:blank" origin={ORIGIN} />
      </EditorProvider>,
    );

    // The canvas reports a click (→ selection) and the block geometry.
    fromCanvas({ type: "canvas:select", id: "h1" });
    fromCanvas({
      type: "canvas:geometry",
      rects: [{ id: "h1", x: 10, y: 20, width: 100, height: 40 }],
    });

    expect(queryByTestId("plumix-overlay-selected")).not.toBeNull();
  });
});
