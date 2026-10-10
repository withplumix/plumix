import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

// A shimmed `useIsLive` returns an element, which is truthy, so the server
// would claim to be live and serve no-JavaScript visitors the enhanced markup.
test("carries no 'use client' directive, which would shim it into a component", () => {
  const source = readFileSync("src/blocks/renderer/use-is-live.ts", "utf8");
  expect(source).not.toContain("use client");
});
