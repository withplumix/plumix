import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { AppContext } from "../context/app.js";
import type { DebugBarInput } from "./config.js";
import { HookRegistry } from "../hooks/registry.js";
import { PlumixDebugBar } from "./component.js";
import { registerCoreDebugPanels } from "./core-panels.js";

function ctxWith(
  debugBar: DebugBarInput | undefined,
  url = "https://cms.example/blog/hello",
): AppContext {
  const hooks = new HookRegistry();
  registerCoreDebugPanels(hooks);
  return {
    hooks,
    request: new Request(url),
    debugBar,
    resolvedEntity: null,
    origin: "https://cms.example",
    basePath: "",
    locale: { code: "en", direction: "ltr" },
  } as unknown as AppContext;
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
    const ctx = {
      hooks,
      request: new Request("https://cms.example/x"),
      debugBar: true,
      resolvedEntity: null,
      origin: "https://cms.example",
      basePath: "",
      locale: { code: "en", direction: "ltr" },
    } as unknown as AppContext;

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
