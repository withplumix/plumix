import { renderHook } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { useIsLive } from "./use-is-live.js";

function Probe() {
  return <span>{useIsLive() ? "live" : "inert"}</span>;
}

describe("useIsLive", () => {
  test("is false on the server render", () => {
    expect(renderToStaticMarkup(<Probe />)).toContain("inert");
  });

  test("is true once running in a browser", () => {
    expect(renderHook(() => useIsLive()).result.current).toBe(true);
  });
});
