import { describe, expect, test } from "vitest";

import type { DebugPanel } from "./types.js";
import { renderDebugPanels } from "./render-panels.js";
import { makeSnapshot } from "./snapshot-fixture.js";

const okPanel: DebugPanel = {
  id: "ok",
  title: "OK",
  render: (snapshot) => <p>path is {snapshot.context.path}</p>,
};

const boomPanel: DebugPanel = {
  id: "boom",
  title: "Boom",
  render: () => {
    throw new Error("kaboom");
  },
};

describe("renderDebugPanels", () => {
  test("renders each panel's markup from the snapshot", () => {
    const rendered = renderDebugPanels(
      [okPanel],
      makeSnapshot({ context: { path: "/blog/hello" } }),
    );

    expect(rendered).toHaveLength(1);
    expect(rendered[0]?.id).toBe("ok");
    expect(rendered[0]?.title).toBe("OK");
    expect(rendered[0]?.html).toContain("/blog/hello");
  });

  test("isolates a throwing panel behind a fallback so siblings survive", () => {
    const rendered = renderDebugPanels([boomPanel, okPanel], makeSnapshot());

    expect(rendered[0]?.html).toContain("failed to render");
    expect(rendered[1]?.html).toContain("path is");
  });
});
