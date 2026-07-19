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
  test("renders node label, matched slot, and the candidate list with the winner marked", () => {
    const ctx = ctxWith({
      nodeLabel: "post: hello-world",
      candidates: ["single-post", "single", "singular", "index"],
      picked: "single-post",
    });

    const html = renderToStaticMarkup(<>{templatePanel.render(ctx)}</>);

    expect(html).toContain("post: hello-world");
    expect(html).toContain("single-post");
    expect(html).toContain("singular");
    // The winning candidate is marked.
    expect(html).toContain("plumix-debug-bar__candidate--picked");
  });

  test("shows an n/a state when no template was resolved (e.g. an error page)", () => {
    const html = renderToStaticMarkup(<>{templatePanel.render(ctxWith())}</>);

    expect(html).toContain("No template resolution");
  });
});
