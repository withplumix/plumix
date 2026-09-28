import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

// The island transform replaces *every* export of a `"use client"` module
// with a component that delegates to an island shim. A shimmed `useIsLive`
// returns an element — truthy — so the server render would claim to be live
// and a no-JavaScript visitor would be served the enhanced markup.
test("carries no 'use client' directive, which would shim it into a component", () => {
  const source = readFileSync("src/blocks/renderer/use-is-live.ts", "utf8");
  expect(source).not.toContain("use client");
});
