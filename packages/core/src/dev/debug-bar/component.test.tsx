import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, test } from "vitest";

import type { AppContext, Db } from "../../context/app.js";
import type { DebugBarInput } from "../debug-bar-config.js";
import { HookRegistry } from "../../hooks/registry.js";
import { createTestContext } from "../../test/context.js";
import { createTestDb } from "../../test/harness.js";
import { registerCoreDebugPanels } from "../debug-panels/core-panels.js";
import { PlumixDebugBar } from "./component.js";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

function ctxWith(
  debugBar: DebugBarInput | undefined,
  url = "https://cms.example/blog/hello",
): AppContext {
  const hooks = new HookRegistry();
  registerCoreDebugPanels(hooks);
  return createTestContext({
    db,
    hooks,
    request: new Request(url),
    debugBar,
  });
}

describe("PlumixDebugBar", () => {
  test("isolates a panel that throws in render — bar and other panels survive", () => {
    const hooks = new HookRegistry();
    registerCoreDebugPanels(hooks);
    hooks.addFilter("debug_bar:panels", (panels) => [
      ...panels,
      {
        id: "boom",
        title: "Boom",
        order: 5,
        render: () => {
          throw new Error("kaboom");
        },
      },
    ]);
    const ctx = createTestContext({
      db,
      hooks,
      request: new Request("https://cms.example/x"),
      debugBar: true,
    });

    const html = renderToStaticMarkup(<PlumixDebugBar ctx={ctx} />);

    expect(html).toContain('data-testid="plumix-debug-bar"');
    // The throwing panel shows a fallback instead of crashing the render.
    expect(html).toContain('data-testid="plumix-debug-panel-boom"');
    expect(html).toContain("failed to render");
    // A healthy sibling panel still renders.
    expect(html).toContain('data-testid="plumix-debug-panel-request"');
  });

  test("renders the bar shell with the Request panel when enabled in dev", () => {
    const html = renderToStaticMarkup(<PlumixDebugBar ctx={ctxWith(true)} />);

    expect(html).toContain('data-testid="plumix-debug-bar"');
    // Request panel surfaces this request's method and path.
    expect(html).toContain("GET");
    expect(html).toContain("/blog/hello");
  });

  test("renders a request switcher with the current request pre-selected", () => {
    const ctx = ctxWith(true);
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

  test("renders nothing when config disables the bar", () => {
    const html = renderToStaticMarkup(<PlumixDebugBar ctx={ctxWith(false)} />);

    expect(html).toBe("");
  });

  test("omits a panel whose id is in the disable denylist", () => {
    const html = renderToStaticMarkup(
      <PlumixDebugBar ctx={ctxWith({ disable: ["request"] })} />,
    );

    expect(html).not.toContain('data-testid="plumix-debug-panel-request"');
  });
});
