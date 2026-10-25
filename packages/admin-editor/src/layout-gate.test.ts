import { describe, expect, test } from "vitest";

import type { BlockInput, BlockSpec } from "@plumix/core/blocks";

import { layoutGate } from "./layout-gate.js";

const body: BlockInput = { name: "body", type: "richtext", content: true };
const align: BlockInput = { name: "align", type: "select" };
const content: BlockInput = { name: "content", type: "slot", content: true };
const width: BlockInput = {
  name: "width",
  type: "text",
  styleProperty: "width",
  content: true,
};
const spec = (inputs: readonly BlockInput[]): BlockSpec => ({
  name: "acme/x",
  render: () => null,
  inputs,
});

describe("layoutGate", () => {
  test("a writer with edit_layout gets every input and selects every block", () => {
    const gate = layoutGate(true);

    expect(gate.editsLayout).toBe(true);
    expect(
      [body, align, width].map((input) => gate.offersInput(input)),
    ).toEqual([true, true, true]);
    expect(gate.selects(spec([]))).toBe(true);
    expect(gate.selects(undefined)).toBe(true);
  });

  test("a writer without it gets only content inputs", () => {
    const gate = layoutGate(false);

    expect(gate.editsLayout).toBe(false);
    expect(
      [body, align, content, width].map((input) => gate.offersInput(input)),
    ).toEqual([true, false, false, false]);
  });

  test("a writer without it selects only a block with a content input", () => {
    const gate = layoutGate(false);

    expect(gate.selects(spec([align, body]))).toBe(true);
    expect(gate.selects(spec([align, content, width]))).toBe(false);
    expect(gate.selects(undefined)).toBe(false);
  });
});
