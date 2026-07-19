import { afterEach, describe, expect, test } from "vitest";

import { createDispatcherHarness } from "../test/dispatcher.js";

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
  });
});
