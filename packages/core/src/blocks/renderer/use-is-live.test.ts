import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { useIsLive } from "./use-is-live.js";

function Probe() {
  return createElement("span", null, useIsLive() ? "live" : "inert");
}

describe("useIsLive", () => {
  test("is false on the server render", () => {
    expect(renderToStaticMarkup(createElement(Probe))).toContain("inert");
  });
});

// A shimmed `useIsLive` returns an element, which is truthy, so the server
// would claim to be live and serve no-JavaScript visitors the enhanced markup.
test("carries no 'use client' directive, which would shim it into a component", () => {
  const source = readFileSync("src/blocks/renderer/use-is-live.ts", "utf8");
  expect(source).not.toContain("use client");
});
