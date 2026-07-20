import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { AppContext } from "../../context/app.js";
import type { TemplateResolution } from "./template.js";
import { createDebugCollector } from "../collector.js";
import { templatePanel } from "./template.js";

function ctxWith(resolution?: TemplateResolution): AppContext {
  const debug = createDebugCollector(undefined);
  if (resolution) debug.record("template", resolution);
  return { debug } as unknown as AppContext;
}

describe("templatePanel", () => {
  test("renders the resolved node label and the matched rule", () => {
    const ctx = ctxWith({
      nodeLabel: "post: hello-world",
      picked: "page",
    });

    const html = renderToStaticMarkup(<>{templatePanel.render(ctx)}</>);

    // Pin the exact `DebugKV` value cells — "post" is too common a substring
    // to assert bare.
    expect(html).toContain("<dd>post: hello-world</dd>");
    expect(html).toContain("<dd>page</dd>");
  });

  test("shows an n/a state when no template was resolved (e.g. an error page)", () => {
    const html = renderToStaticMarkup(<>{templatePanel.render(ctxWith())}</>);

    expect(html).toContain("No template resolution");
  });
});
