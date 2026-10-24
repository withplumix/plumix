import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, test, vi } from "vitest";

import type { DevInput } from "../../config.js";
import type { AppContext, Db } from "../../context/app-context.js";
import { createDevRuntime } from "../../runtime/dev.js";
import { createTestContext, silentLogger } from "../../test/context.js";
import { createTestDb } from "../../test/harness.js";
import { registerCoreDebugPanels } from "../debug-panels/core-panels.js";
import { registerDevItem } from "../registrations.js";
import { projectDebugSnapshot } from "../request-history/snapshot.js";
import { PlumixDebugBar } from "./component.js";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

function ctxWith(
  dev: DevInput | undefined,
  url = "https://cms.example/blog/hello",
): AppContext {
  const runtime = dev && createDevRuntime(dev);
  if (runtime) registerCoreDebugPanels(runtime);
  return createTestContext({
    db,
    request: new Request(url),
    dev: runtime,
  });
}

describe("PlumixDebugBar", () => {
  test("hides a panel whose render throws, logging it, and keeps the rest", () => {
    const error = vi.fn();
    const dev = createDevRuntime({ bar: true });
    registerCoreDebugPanels(dev);
    registerDevItem(
      dev.debugPanels,
      "debug panel",
      {
        id: "boom",
        title: "Boom",
        order: 5,
        render: () => {
          throw new Error("kaboom");
        },
      },
      "boom-plugin",
    );
    const ctx = createTestContext({
      db,
      request: new Request("https://cms.example/x"),
      dev,
      logger: { ...silentLogger, error },
    });

    const html = renderToStaticMarkup(<PlumixDebugBar ctx={ctx} />);

    expect(html).not.toContain('data-testid="plumix-debug-panel-boom"');
    expect(html).toContain('data-testid="plumix-debug-panel-request"');
    expect(error).toHaveBeenCalledExactlyOnceWith(
      '[plumix] debug panel "boom" failed to render plugin=boom-plugin: kaboom',
      expect.objectContaining({ id: "boom", plugin: "boom-plugin" }),
    );
  });

  test("renders the bar shell with the Request panel when enabled in dev", () => {
    const html = renderToStaticMarkup(
      <PlumixDebugBar ctx={ctxWith({ bar: true })} />,
    );

    expect(html).toContain('data-testid="plumix-debug-bar"');
    // Request panel surfaces this request's method and path.
    expect(html).toContain("GET");
    expect(html).toContain("/blog/hello");
  });

  test("renders a request switcher with the current request pre-selected", () => {
    const ctx = ctxWith({ bar: true });
    const html = renderToStaticMarkup(<PlumixDebugBar ctx={ctx} />);

    // The switcher and its dev-only swap script are present, and the panels
    // live in the container the script swaps in place.
    expect(html).toContain('data-testid="plumix-debug-switcher"');
    expect(html).toContain('data-testid="plumix-debug-switcher-script"');
    expect(html).toContain('data-testid="plumix-debug-panels"');
    // The in-flight request leads the list, labelled and pre-selected.
    expect(html).toContain("GET /blog/hello · current");
    expect(html).toContain(`value="${ctx.requestId}"`);
  });

  test("lists the app's captured requests in the switcher", () => {
    const dev = createDevRuntime({ bar: true });
    const past = ctxWith({ bar: true }, "https://cms.example/earlier");
    dev.history.save({
      id: "past-1",
      startedAt: 1,
      status: 200,
      durationMs: 3,
      snapshot: projectDebugSnapshot({ spans: [], records: {} }, past),
    });
    registerCoreDebugPanels(dev);
    const ctx = createTestContext({
      db,
      request: new Request("https://cms.example/now"),
      dev,
    });

    const html = renderToStaticMarkup(<PlumixDebugBar ctx={ctx} />);

    // The ring the app handed down, not a module default nothing configured.
    expect(html).toContain('value="past-1"');
  });

  test("renders nothing when `dev.bar` is false", () => {
    const html = renderToStaticMarkup(
      <PlumixDebugBar ctx={ctxWith({ bar: false })} />,
    );

    expect(html).toBe("");
  });

  test("omits a panel `dev.panels` switches off", () => {
    const html = renderToStaticMarkup(
      <PlumixDebugBar ctx={ctxWith({ panels: { request: false } })} />,
    );

    expect(html).not.toContain('data-testid="plumix-debug-panel-request"');
    // A panel it did not name is untouched.
    expect(html).toContain('data-testid="plumix-debug-panel-app"');
  });
});
