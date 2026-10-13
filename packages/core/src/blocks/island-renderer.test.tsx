import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { islandRootKind, mergeSlotProps } from "./island-renderer.js";

function Card(props: Readonly<Record<string, unknown>>) {
  return (
    <div>
      <span>{String(props.label)}</span>
      {props.children as never}
    </div>
  );
}

describe("mergeSlotProps", () => {
  test("wraps a slot's HTML in a static slot on its named prop", () => {
    const props = mergeSlotProps(
      { label: "x" },
      { children: "<strong>kid</strong>" },
    );

    expect(renderToStaticMarkup(<Card {...props} />)).toBe(
      '<div><span>x</span><plumix-static-slot data-plumix-slot="children"><strong>kid</strong></plumix-static-slot></div>',
    );
  });

  test("passes the props through when the island has no slots", () => {
    const props = mergeSlotProps({ label: "x" }, {});

    expect(renderToStaticMarkup(<Card {...props} />)).toBe(
      "<div><span>x</span></div>",
    );
  });
});

describe("islandRootKind", () => {
  test("hydrates a server-rendered island in dev, so a mismatch is reported", () => {
    expect(islandRootKind(true, true)).toBe("hydrate");
  });

  test("creates a client-only island's root in dev, still reporting its errors", () => {
    expect(islandRootKind(true, false)).toBe("create-reporting");
  });

  test.each([true, false])(
    "creates a plain root in production (hydrate: %s)",
    (hydrate) => {
      expect(islandRootKind(false, hydrate)).toBe("create");
    },
  );
});
