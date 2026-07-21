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
  test("renders the resolution table: node, winner, and each rule's status", () => {
    const ctx = ctxWith({
      nodeLabel: "post: hello-world",
      winner: "post",
      steps: [
        { label: "fallback", status: "never-evaluated" },
        {
          label: "post",
          status: "matched",
          predicate: { fired: true, result: true },
        },
        {
          label: "post:draft",
          status: "skipped",
          predicate: { fired: true, result: false },
        },
        {
          label: "page",
          status: "skipped",
          predicate: { fired: false, result: false },
        },
      ],
    });

    const html = renderToStaticMarkup(<>{templatePanel.render(ctx)}</>);

    // Node + winner in their exact `DebugKV` value cells.
    expect(html).toContain("<dd>post: hello-world</dd>");
    expect(html).toContain("<dd>post</dd>");
    // Every rule's status class is emitted.
    expect(html).toContain("plumix-debug-bar__status--matched");
    expect(html).toContain("plumix-debug-bar__status--never-evaluated");
    expect(html).toContain("plumix-debug-bar__status--skipped");
    // Predicate outcomes: passed / failed / never-ran.
    expect(html).toContain("passed");
    expect(html).toContain("failed");
    expect(html).toContain("n/a");
  });

  test("marks a 404 when no rule matched", () => {
    const ctx = ctxWith({
      nodeLabel: "post: orphan",
      winner: null,
      steps: [{ label: "archive", status: "never-evaluated" }],
    });

    const html = renderToStaticMarkup(<>{templatePanel.render(ctx)}</>);

    expect(html).toContain("no match → 404");
  });

  test("shows an n/a state when no template was resolved (e.g. an error page)", () => {
    const html = renderToStaticMarkup(<>{templatePanel.render(ctxWith())}</>);

    expect(html).toContain("No template resolution");
  });
});
