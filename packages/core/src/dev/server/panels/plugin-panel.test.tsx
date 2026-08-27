import { afterEach, describe, expect, test } from "vitest";

import type { DevErrorPanel } from "../../../index.js";
import { DevErrorFacts, DevErrorSubhead } from "../../../index.js";
import { definePlugin } from "../../../plugin/define.js";
import { fallback } from "../../../route/render/template-builders.js";
import { createDispatcherHarness } from "../../../test/dispatcher.js";
import { defineTheme } from "../../../theme.js";

// A plugin panel author's happy path on the dev error page: contribute a panel
// through `error_page:panels`, reading off the caught error, and it renders as
// its own section on the 500 page — built from the primitives the package
// barrel publishes rather than re-spelling the page's class names.
const demoPanel: DevErrorPanel = {
  id: "error-panel-demo",
  title: "Demo",
  order: 50,
  render: (caught) => (
    <>
      <DevErrorSubhead>Caught</DevErrorSubhead>
      <DevErrorFacts
        facts={[
          {
            label: "message",
            value: caught instanceof Error ? caught.message : "unknown",
          },
        ]}
      />
    </>
  ),
};

const demoPlugin = definePlugin("error-panel-demo", (ctx) => {
  ctx.addFilter("error_page:panels", (panels) => [...panels, demoPanel]);
});

const boomTheme = defineTheme({
  templates: [
    fallback(() => {
      throw new Error("template blew up");
    }),
  ],
});

describe("dev error page plugin panel", () => {
  const original = process.env.PLUMIX_DEV;
  afterEach(() => {
    if (original === undefined) delete process.env.PLUMIX_DEV;
    else process.env.PLUMIX_DEV = original;
  });

  test("a plugin panel renders as a section on the dev 500 page", async () => {
    process.env.PLUMIX_DEV = "1";
    const h = await createDispatcherHarness({
      plugins: [demoPlugin],
      theme: boomTheme,
    });

    const res = await h.dispatch(new Request("https://cms.example/"));
    const html = await res.text();

    expect(res.status).toBe(500);
    expect(html).toContain(
      'data-testid="plumix-dev-error-panel-error-panel-demo"',
    );
    expect(html).toContain("Demo");
    // The panel read the caught error off the filter's error argument and
    // rendered it through the page's own fact markup.
    expect(html).toContain("template blew up");
    expect(html).toContain('class="plumix-dev-error__fact-label"');
  });

  test("no panel section renders when no plugin contributes one", async () => {
    process.env.PLUMIX_DEV = "1";
    const h = await createDispatcherHarness({ theme: boomTheme });

    const res = await h.dispatch(new Request("https://cms.example/"));
    const html = await res.text();

    expect(res.status).toBe(500);
    expect(html).not.toContain('data-testid="plumix-dev-error-panels"');
  });
});
