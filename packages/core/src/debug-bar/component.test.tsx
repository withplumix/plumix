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
