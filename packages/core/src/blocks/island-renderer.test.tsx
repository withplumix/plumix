import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  islandRootKind,
  islandRootOptions,
  mergeSlotProps,
} from "./island-renderer.js";

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

describe("islandRootOptions", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const element = {} as HTMLElement;

  test("a hydrated root takes the island's id prefix and reports errors and mismatches in dev", () => {
    vi.stubEnv("PLUMIX_DEV", "1");

    const options = islandRootOptions("hydrate", "i0-", element, "");

    expect(options.identifierPrefix).toBe("i0-");
    expect(Object.keys(options)).toEqual([
      "identifierPrefix",
      "onUncaughtError",
      "onRecoverableError",
    ]);
  });

  test("a client-only root in dev takes the id prefix and reports errors", () => {
    vi.stubEnv("PLUMIX_DEV", "1");

    const options = islandRootOptions("create-reporting", "i1-", element, "");

    expect(options.identifierPrefix).toBe("i1-");
    expect(Object.keys(options)).toEqual([
      "identifierPrefix",
      "onUncaughtError",
    ]);
  });

  test("a production root takes the id prefix and no reporter", () => {
    vi.stubEnv("PLUMIX_DEV", "");

    const options = islandRootOptions("create", "i2-", element, "");

    expect(options).toEqual({ identifierPrefix: "i2-" });
  });
});
