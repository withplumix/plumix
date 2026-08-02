// @vitest-environment jsdom
/// <reference lib="dom" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { installDevClient } from "./index.js";

// The island error dialog mounts under this custom-element host (owned by
// `@plumix/blocks`). Its presence in the DOM is the proof that core installed
// the blocks-side overlay through the event seam.
const OVERLAY_HOST = "plumix-dev-error-overlay";

// The overlay renders its React root on the scheduler; give it a macrotask to
// flush before reading the DOM.
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("installDevClient", () => {
  let originalFetch: typeof globalThis.fetch;
  let uninstall: () => void = () => undefined;

  beforeEach(() => {
    document.body.innerHTML = "";
    process.env.PLUMIX_DEV = "1";
    // The terminal forwarder POSTs to a dev endpoint on capture; stub fetch so
    // an async flush never touches the network (or throws in jsdom).
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null));
  });

  afterEach(async () => {
    // Tear down the singletons (island/compile/terminal) so each test installs
    // fresh — the blocks installers are idempotent and would otherwise no-op.
    uninstall();
    uninstall = () => undefined;
    delete process.env.PLUMIX_DEV;
    delete process.env.PLUMIX_FORWARD_ERRORS;
    globalThis.fetch = originalFetch;
    document.body.innerHTML = "";
    await tick();
  });

  test("installs the island dialog: a hydration mismatch surfaces the overlay", async () => {
    uninstall = installDevClient();
    window.dispatchEvent(
      new CustomEvent("plumix:island-hydration-mismatch", {
        detail: { componentStack: "at Counter", server: "0", client: "1" },
      }),
    );
    await tick();
    expect(document.querySelector(OVERLAY_HOST)).not.toBeNull();
  });

  test("installs the compile overlay when a Vite hot client is supplied", () => {
    const on = vi.fn();
    uninstall = installDevClient({ hot: { on } });
    expect(on).toHaveBeenCalledWith("vite:error", expect.any(Function));
  });

  test("replays a buffered vite:error into the compile overlay", () => {
    uninstall = installDevClient({
      hot: { on: vi.fn() },
      initialCompileError: {
        err: { message: "Unexpected token", plugin: "vite:css" },
      },
    });
    // The compile overlay mounts its own host when handed an initial error to
    // replay.
    expect(
      document.querySelector("plumix-compile-error-overlay"),
    ).not.toBeNull();
  });

  test("skips the compile overlay when no hot client is supplied", () => {
    uninstall = installDevClient();
    expect(document.querySelector("plumix-compile-error-overlay")).toBeNull();
  });

  test("with the dev gate off, an island fault surfaces nothing", async () => {
    delete process.env.PLUMIX_DEV;
    uninstall = installDevClient();
    window.dispatchEvent(
      new CustomEvent("plumix:island-hydration-mismatch", {
        detail: { componentStack: "at Counter" },
      }),
    );
    await tick();
    expect(document.querySelector(OVERLAY_HOST)).toBeNull();
  });
});
