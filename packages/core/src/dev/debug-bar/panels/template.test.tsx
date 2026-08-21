import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { TemplateResolution } from "../../../route/render/template-hierarchy.js";
import { createTelemetryCollector } from "../../../context/collector.js";
import { makeSnapshot } from "../snapshot-fixture.js";
import { TEMPLATE_PANEL_ID } from "../template-node-label.js";
import { templatePanel } from "./template.js";

// The renderer stores the resolution walk as an attribute on the `template`
// span (nested under `render`, as in a real request) — the panel reads it back
// from the snapshot's span tree.
function render(resolution?: TemplateResolution): string {
  const telemetry = createTelemetryCollector();
  telemetry.span("render", () => {
    if (resolution) {
      telemetry.span(TEMPLATE_PANEL_ID, (s) => {
        s.set("resolution", resolution);
      });
    }
  });
  const snapshot = makeSnapshot({ spans: telemetry.getSpans() });
  return renderToStaticMarkup(<>{templatePanel.render(snapshot)}</>);
}

describe("templatePanel", () => {
  test("renders the resolution table: node, winner, and each rule's status", () => {
    const html = render({
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
    const html = render({
      nodeLabel: "post: orphan",
      winner: null,
      steps: [{ label: "archive", status: "never-evaluated" }],
    });

    expect(html).toContain("no match → 404");
  });

  test("shows an n/a state when no template was resolved (e.g. an error page)", () => {
    const html = render();

    expect(html).toContain("No template resolution");
  });
});
