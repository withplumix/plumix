import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { PlumixEditor } from "./plumix-editor.js";

afterEach(cleanup);

describe("PlumixEditor", () => {
  test("mounts the canvas for the given preview URL", () => {
    const { getByTestId, container } = render(
      <PlumixEditor
        previewUrl="about:blank"
        origin="http://localhost:3000"
        defaultValue={{ version: "plumix.v2", blocks: [] }}
      />,
    );

    expect(getByTestId("plumix-canvas-frame")).toBeDefined();
    expect(container.querySelector("iframe")?.getAttribute("src")).toBe(
      "about:blank",
    );
  });
});
