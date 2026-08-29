import { readFileSync } from "node:fs";
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

// The island transform replaces *every* export of a `"use client"` module
// with a component that delegates to an island shim. A shimmed `useIsLive`
// returns an element — truthy — so the server render would claim to be live
// and a no-JavaScript visitor would be served the enhanced markup.
test("carries no 'use client' directive, which would shim it into a component", () => {
  const source = readFileSync("src/renderer/use-is-live.ts", "utf8");
  expect(source).not.toContain("use client");
});
