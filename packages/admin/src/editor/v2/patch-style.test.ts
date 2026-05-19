import type { Data } from "@puckeditor/core";
import { describe, expect, test } from "vitest";

import { patchStyleAtSelector } from "./patch-style.js";

function data(content: readonly { type: string; props: Record<string, unknown> }[]): Data {
  return {
    content: content as Data["content"],
    root: { props: {} },
  };
}

describe("patchStyleAtSelector", () => {
  test("patches the style prop of a top-level item at the selector's index", () => {
    const before = data([
      { type: "core/heading", props: { id: "h1", text: "A" } },
      { type: "core/heading", props: { id: "h2", text: "B" } },
    ]);

    const after = patchStyleAtSelector(
      before,
      { index: 1, zone: "root:default-zone" },
      { large: { padding: "md" } },
    );

    expect(after.content[1]?.props).toEqual({
      id: "h2",
      text: "B",
      style: { large: { padding: "md" } },
    });
    expect(after.content[0]).toBe(before.content[0]);
  });

  test("patches a nested item inside a parent's slot, preserving sibling ids", () => {
    const before = data([
      {
        type: "core/group",
        props: {
          id: "g1",
          content: [
            { type: "core/heading", props: { id: "child-a", text: "A" } },
            { type: "core/heading", props: { id: "child-b", text: "B" } },
          ],
        },
      },
    ]);

    const after = patchStyleAtSelector(
      before,
      { index: 1, zone: "g1:content" },
      { large: { padding: "lg" } },
    );

    const parent = after.content[0]?.props as { content: { props: { id: string; style?: unknown } }[] };
    expect(parent.content[0]?.props.id).toBe("child-a");
    expect(parent.content[1]?.props.id).toBe("child-b");
    expect(parent.content[1]?.props.style).toEqual({ large: { padding: "lg" } });
  });

  test("treats a selector without a zone as root-level (matches Puck's default)", () => {
    const before = data([
      { type: "core/heading", props: { id: "h1", text: "A" } },
    ]);

    const after = patchStyleAtSelector(
      before,
      { index: 0 },
      { large: { padding: "sm" } },
    );

    expect(after.content[0]?.props).toEqual({
      id: "h1",
      text: "A",
      style: { large: { padding: "sm" } },
    });
  });

  test("clears the style key when nextStyle is undefined", () => {
    const before = data([
      {
        type: "core/heading",
        props: {
          id: "h1",
          text: "A",
          style: { large: { padding: "md" } },
        },
      },
    ]);

    const after = patchStyleAtSelector(
      before,
      { index: 0, zone: "root:default-zone" },
      undefined,
    );

    expect(after.content[0]?.props).toEqual({ id: "h1", text: "A" });
  });
});
