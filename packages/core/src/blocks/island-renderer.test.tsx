import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  islandRootKind,
  mergeSlotProps,
  mountWith,
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

interface RootCall {
  readonly kind: "create" | "hydrate";
  readonly options: object | undefined;
}

/** Doubles `react-dom/client`, recording the root each mount creates. */
function recordingRoots(): {
  readonly calls: RootCall[];
  readonly roots: Parameters<typeof mountWith>[0];
} {
  const calls: RootCall[] = [];
  const root = { render: () => undefined, unmount: () => undefined };
  return {
    calls,
    roots: {
      createRoot: (_container, options) => {
        calls.push({ kind: "create", options });
        return root;
      },
      hydrateRoot: (_container, _node, options) => {
        calls.push({ kind: "hydrate", options });
        return root;
      },
    },
  };
}

function mountProbe(
  roots: Parameters<typeof mountWith>[0],
  hydrate: boolean,
): void {
  const element = { innerHTML: "" } as HTMLElement;
  mountWith(roots, element, { hydrate, identifierPrefix: "i0-" }).render(
    Card,
    { label: "x" },
    {},
  );
}

describe("mount", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("hydrates a server-rendered island in dev under its id prefix, reporting errors and mismatches", () => {
    vi.stubEnv("PLUMIX_DEV", "1");
    const { calls, roots } = recordingRoots();

    mountProbe(roots, true);

    expect(calls.map(({ kind }) => kind)).toEqual(["hydrate"]);
    expect(calls[0]?.options).toMatchObject({ identifierPrefix: "i0-" });
    expect(Object.keys(calls[0]?.options ?? {})).toEqual([
      "identifierPrefix",
      "onUncaughtError",
      "onRecoverableError",
    ]);
  });

  test("creates a client-only island's root in dev under its id prefix, reporting errors", () => {
    vi.stubEnv("PLUMIX_DEV", "1");
    const { calls, roots } = recordingRoots();

    mountProbe(roots, false);

    expect(calls.map(({ kind }) => kind)).toEqual(["create"]);
    expect(calls[0]?.options).toMatchObject({ identifierPrefix: "i0-" });
    expect(Object.keys(calls[0]?.options ?? {})).toEqual([
      "identifierPrefix",
      "onUncaughtError",
    ]);
  });

  test("creates a production root under the island's id prefix, with no reporter", () => {
    vi.stubEnv("PLUMIX_DEV", "");
    const { calls, roots } = recordingRoots();

    mountProbe(roots, true);

    expect(calls).toEqual([
      { kind: "create", options: { identifierPrefix: "i0-" } },
    ]);
  });
});
