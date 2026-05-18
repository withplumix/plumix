import { describe, expect, test } from "vitest";

import { nextTrackedNode } from "./next-tracked.js";

const heading = {
  node: { type: { name: "core/heading" }, nodeSize: 7, toJSON: () => ({}) },
  pos: 0,
};
const paragraph = {
  node: { type: { name: "core/paragraph" }, nodeSize: 4, toJSON: () => ({}) },
  pos: 8,
};

describe("nextTrackedNode", () => {
  test("non-touch + null incoming → null", () => {
    expect(
      nextTrackedNode({
        isTouch: false,
        current: heading,
        incoming: { node: null, pos: -1 },
      }),
    ).toBeNull();
  });

  test("non-touch + node incoming → tracked = incoming", () => {
    expect(
      nextTrackedNode({
        isTouch: false,
        current: heading,
        incoming: { node: paragraph.node, pos: paragraph.pos },
      }),
    ).toEqual(paragraph);
  });

  test("touch + null incoming + null current → null (nothing to suppress)", () => {
    expect(
      nextTrackedNode({
        isTouch: true,
        current: null,
        incoming: { node: null, pos: -1 },
      }),
    ).toBeNull();
  });

  test("touch + null incoming + existing current → keep current (suppress)", () => {
    expect(
      nextTrackedNode({
        isTouch: true,
        current: heading,
        incoming: { node: null, pos: -1 },
      }),
    ).toBe(heading);
  });

  test("touch + node incoming → tracked = incoming (real anchor change wins)", () => {
    expect(
      nextTrackedNode({
        isTouch: true,
        current: heading,
        incoming: { node: paragraph.node, pos: paragraph.pos },
      }),
    ).toEqual(paragraph);
  });
});
