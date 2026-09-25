import { describe, expect, test } from "vitest";

import { coreBlocks } from "@plumix/blocks";

import { BLOCK_DESCRIPTORS } from "./block-i18n.js";

const PREFIX = "block.core.";

// Walks the whole spec rather than naming fields, so a descriptor on a
// BlockSpec field added later is still collected.
function collectDescriptors(
  value: unknown,
  found: Map<string, string>,
  seen: Set<object>,
): void {
  if (typeof value !== "object" || value === null || seen.has(value)) return;
  seen.add(value);
  if (
    "id" in value &&
    "message" in value &&
    typeof value.id === "string" &&
    typeof value.message === "string" &&
    value.id.startsWith(PREFIX)
  ) {
    found.set(value.id, value.message);
    return;
  }
  for (const child of Object.values(value)) {
    collectDescriptors(child, found, seen);
  }
}

function specDescriptors(): Map<string, string> {
  const found = new Map<string, string>();
  const seen = new Set<object>();
  for (const spec of coreBlocks) collectDescriptors(spec, found, seen);
  return found;
}

function mirrorDescriptors(): Map<string, string | undefined> {
  return new Map(
    Object.values(BLOCK_DESCRIPTORS).map((d) => [d.id, d.message]),
  );
}

describe("BLOCK_DESCRIPTORS", () => {
  const specs = specDescriptors();
  const mirror = mirrorDescriptors();

  test("collects the core block specs' descriptors", () => {
    expect(specs.size).toBeGreaterThan(0);
  });

  test("mirrors every core block spec descriptor", () => {
    const missing = [...specs.keys()].filter((id) => !mirror.has(id));
    expect(missing).toEqual([]);
  });

  test("holds no descriptor that no core block spec declares", () => {
    const extra = [...mirror.keys()].filter((id) => !specs.has(id));
    expect(extra).toEqual([]);
  });

  test("carries each descriptor's message verbatim", () => {
    const drifted = [...specs]
      .filter(([id, message]) => mirror.has(id) && mirror.get(id) !== message)
      .map(([id, message]) => ({ id, spec: message, mirror: mirror.get(id) }));
    expect(drifted).toEqual([]);
  });
});
