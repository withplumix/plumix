import { describe, expect, test, vi } from "vitest";

import type { DebugPanel, DevRegistered } from "../../context/dev-runtime.js";
import { silentLogger } from "../../test/context.js";
import { makeSnapshot } from "../request-history/snapshot-fixture.js";
import { renderDebugPanels } from "./render-panels.js";

const okPanel: DevRegistered<DebugPanel> = {
  id: "ok",
  title: "OK",
  render: (snapshot) => <p>path is {snapshot.context.path}</p>,
  registeredBy: null,
};

const boomPanel: DevRegistered<DebugPanel> = {
  id: "boom",
  title: "Boom",
  render: () => {
    throw new Error("kaboom");
  },
  registeredBy: null,
};

describe("renderDebugPanels", () => {
  test("renders each panel's markup from the snapshot", () => {
    const rendered = renderDebugPanels(
      [okPanel],
      makeSnapshot({ context: { path: "/blog/hello" } }),
      silentLogger,
    );

    expect(rendered).toHaveLength(1);
    expect(rendered[0]?.id).toBe("ok");
    expect(rendered[0]?.title).toBe("OK");
    expect(rendered[0]?.html).toContain("/blog/hello");
  });

  test("leaves out a panel whose render throws, so its siblings still render", () => {
    const rendered = renderDebugPanels(
      [boomPanel, okPanel],
      makeSnapshot(),
      silentLogger,
    );

    expect(rendered.map((panel) => panel.id)).toEqual(["ok"]);
  });

  test("logs core's own failing panel as core's", () => {
    const error = vi.fn();

    renderDebugPanels([boomPanel], makeSnapshot(), { ...silentLogger, error });

    expect(error).toHaveBeenCalledExactlyOnceWith(
      '[plumix] debug panel "boom" failed to render plugin=core: kaboom',
      expect.objectContaining({ id: "boom", plugin: null }),
    );
  });
});
