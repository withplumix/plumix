import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { createBlockRegistry } from "../block-registry.js";
import {
  PlumixProvider,
  useIsEditing,
  useIsPreview,
  usePlumixMode,
} from "./index.js";

const registry = createBlockRegistry([]);

function Probe(): ReactElement {
  return (
    <span>
      {`mode=${usePlumixMode()} editing=${String(useIsEditing())} preview=${String(useIsPreview())}`}
    </span>
  );
}

describe("render mode hooks", () => {
  test("edit mode: editing and preview are both true", () => {
    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry, mode: "edit" }}>
        <Probe />
      </PlumixProvider>,
    );
    expect(html).toContain("mode=edit editing=true preview=true");
  });

  test("preview mode: previewing but not editing", () => {
    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry, mode: "preview" }}>
        <Probe />
      </PlumixProvider>,
    );
    expect(html).toContain("mode=preview editing=false preview=true");
  });

  test("defaults to live when no mode is provided", () => {
    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry }}>
        <Probe />
      </PlumixProvider>,
    );
    expect(html).toContain("mode=live editing=false preview=false");
  });
});
