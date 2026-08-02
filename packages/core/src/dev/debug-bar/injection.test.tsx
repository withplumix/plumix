import { afterEach, describe, expect, test } from "vitest";

import { createDispatcherHarness } from "../../test/dispatcher.js";
import { DEBUG_REQUESTS_PATH } from "./requests-path.js";

interface DebugRequestListShape {
  readonly id: string;
  readonly path: string;
}

// The debug bar is gated on `process.env.PLUMIX_DEV` at both registration
// (buildApp) and injection (renderTree). In a Vite build the define makes it
// empty and the whole module tree-shakes; here we toggle it directly to prove
// the runtime gate. Dispatching an unknown URL renders the 404 through the
// shared renderTree, so this also covers error-page injection.
const UNKNOWN_URL = "https://cms.example/no-such-page";

describe("debug bar injection", () => {
  const original = process.env.PLUMIX_DEV;
  afterEach(() => {
    if (original === undefined) delete process.env.PLUMIX_DEV;
    else process.env.PLUMIX_DEV = original;
  });

  test("is injected into the rendered page (incl. 404) in dev", async () => {
    process.env.PLUMIX_DEV = "1";
    const h = await createDispatcherHarness();

    const res = await h.dispatch(new Request(UNKNOWN_URL));
    const html = await res.text();

    expect(res.status).toBe(404);
    expect(html).toContain('data-testid="plumix-debug-bar"');
    expect(html).toContain('data-testid="plumix-debug-panel-request"');
  });

  test("is absent from the rendered page when not in dev (prod build)", async () => {
    delete process.env.PLUMIX_DEV;
    const h = await createDispatcherHarness();

    const res = await h.dispatch(new Request(UNKNOWN_URL));
    const html = await res.text();

    expect(res.status).toBe(404);
    expect(html).not.toContain("plumix-debug-bar");
    // The switcher and its client script are part of the same tree-shaken unit.
    expect(html).not.toContain("plumix-debug-switcher");
    expect(html).not.toContain("data-plumix-debug-switch");
  });

  // The end-to-end path a developer drives: a request is captured, the next
  // page's bar lists it in the switcher, and selecting it renders that request's
  // panels. Selection is client-side (fetch → swap), so we exercise the wire
  // contract the script uses: the option's value is the captured id, and that
  // id's `?format=html` returns the panels.
  test("lists a captured request in the switcher and renders its panels", async () => {
    process.env.PLUMIX_DEV = "1";
    const h = await createDispatcherHarness();

    // Drive a request and let capture run.
    await h.dispatch(new Request("https://cms.example/no-such-page"));
    await h.drainDeferred();

    // The captured id — the value the switcher <option> carries and the script
    // fetches on selection.
    const list = (await (
      await h.dispatch(new Request(`https://cms.example${DEBUG_REQUESTS_PATH}`))
    ).json()) as DebugRequestListShape[];
    const captured = list.find((item) => item.path === "/no-such-page");
    expect(captured).toBeDefined();

    // The next page's bar surfaces the switcher, its script, and an option for
    // the captured request keyed by that exact id.
    const pageHtml = await (
      await h.dispatch(new Request("https://cms.example/another-missing"))
    ).text();
    expect(pageHtml).toContain('data-testid="plumix-debug-switcher"');
    expect(pageHtml).toContain('data-testid="plumix-debug-switcher-script"');
    expect(pageHtml).toContain(`value="${captured?.id}"`);
    expect(pageHtml).toContain("GET /no-such-page · 404");

    // Selecting it fetches the pre-rendered panels the script swaps in.
    const panelsRes = await h.dispatch(
      new Request(
        `https://cms.example${DEBUG_REQUESTS_PATH}/${captured?.id}?format=html`,
      ),
    );
    expect(panelsRes.headers.get("content-type")).toContain("text/html");
    expect(await panelsRes.text()).toContain(
      'data-testid="plumix-debug-panel-request"',
    );
  });
});
