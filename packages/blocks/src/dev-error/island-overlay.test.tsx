import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { installIslandErrorOverlay } from "./island-overlay.js";

const HOST_TAG = "plumix-dev-error-overlay";

let uninstall: () => void = () => undefined;

// React roots inside the shadow render on the scheduler; give it a macrotask
// to flush before reading the DOM. Mirrors the island-element suite's teardown.
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function host(): HTMLElement | null {
  return document.querySelector<HTMLElement>(HOST_TAG);
}

function shadow(): ShadowRoot {
  const el = host();
  if (!el?.shadowRoot) throw new Error("overlay host not mounted");
  return el.shadowRoot;
}

function query(testid: string): HTMLElement | null {
  return shadow().querySelector<HTMLElement>(`[data-testid="${testid}"]`);
}

function island(componentExport: string): HTMLElement {
  const el = document.createElement("plumix-island");
  el.setAttribute("component-export", componentExport);
  return el;
}

function dispatchHydrationError(
  error: unknown,
  element?: HTMLElement,
): boolean {
  return window.dispatchEvent(
    new CustomEvent("plumix:hydration-error", {
      detail: { error, element },
      cancelable: true,
    }),
  );
}

describe("installIslandErrorOverlay", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    uninstall = installIslandErrorOverlay();
  });

  afterEach(async () => {
    uninstall();
    document.body.innerHTML = "";
    await tick();
  });

  test("stays out of the DOM until an island error is captured", () => {
    expect(host()).toBeNull();
  });

  test("captures a hydration error, swallows the default, and shows a corner badge", async () => {
    const notPrevented = dispatchHydrationError(
      new Error("hydrate boom"),
      island("Counter"),
    );
    // dispatchEvent returns false when a listener called preventDefault — the
    // overlay consumes the event so the framework's default console log is
    // suppressed.
    expect(notPrevented).toBe(false);

    await tick();
    const badge = query("plumix-island-overlay-badge");
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain("1");
    // A badge, not a full-screen takeover: no panel until it is expanded.
    expect(query("plumix-island-overlay-panel")).toBeNull();
  });

  test("expands the badge into a panel that renders the shared error renderer", async () => {
    dispatchHydrationError(new Error("hydrate boom"), island("Counter"));
    await tick();

    query("plumix-island-overlay-badge")?.click();
    await tick();

    const panel = query("plumix-island-overlay-panel");
    expect(panel).not.toBeNull();
    // The shared DevErrorPage renders inside the panel.
    expect(query("plumix-dev-error-message")?.textContent).toBe("hydrate boom");
    // Names the island that failed.
    expect(query("plumix-island-overlay-label")?.textContent).toContain(
      "Counter",
    );
  });

  test("shows the React component stack when the island-error carried one", async () => {
    window.dispatchEvent(
      new CustomEvent("plumix:island-error", {
        detail: {
          error: new Error("render boom"),
          componentStack: "\n    at Counter\n    at App",
          element: island("Counter"),
        },
      }),
    );
    await tick();
    query("plumix-island-overlay-badge")?.click();
    await tick();

    expect(query("plumix-dev-error-component-stack")?.textContent).toContain(
      "at Counter",
    );
  });

  test("counts and navigates between multiple distinct errors", async () => {
    dispatchHydrationError(new Error("first boom"), island("Alpha"));
    dispatchHydrationError(new Error("second boom"), island("Beta"));
    await tick();

    const badge = query("plumix-island-overlay-badge");
    expect(badge?.textContent).toContain("2");

    badge?.click();
    await tick();

    // Newest error is shown first.
    expect(query("plumix-dev-error-message")?.textContent).toBe("second boom");
    expect(query("plumix-island-overlay-count")?.textContent).toContain("1");

    query("plumix-island-overlay-next")?.click();
    await tick();
    expect(query("plumix-dev-error-message")?.textContent).toBe("first boom");

    query("plumix-island-overlay-prev")?.click();
    await tick();
    expect(query("plumix-dev-error-message")?.textContent).toBe("second boom");
  });

  test("keeps the expanded panel pinned to the error being read when a newer one arrives", async () => {
    dispatchHydrationError(new Error("reading this"), island("Alpha"));
    await tick();
    query("plumix-island-overlay-badge")?.click();
    await tick();
    expect(query("plumix-dev-error-message")?.textContent).toBe("reading this");

    // A newer error arrives while the panel is open; it must not swap out.
    dispatchHydrationError(new Error("newer"), island("Beta"));
    await tick();

    expect(query("plumix-dev-error-message")?.textContent).toBe("reading this");
    // The read error shifted from slot 1 to slot 2 of 2.
    expect(query("plumix-island-overlay-count")?.textContent).toContain(
      "2 / 2",
    );
  });

  test("deduplicates the same error object dispatched twice", async () => {
    const error = new Error("same boom");
    dispatchHydrationError(error, island("Counter"));
    dispatchHydrationError(error, island("Counter"));
    await tick();

    expect(query("plumix-island-overlay-badge")?.textContent).toContain("1");
  });

  test("captures async window errors and unhandled rejections", async () => {
    window.dispatchEvent(
      new ErrorEvent("error", { error: new Error("async boom") }),
    );
    await tick();
    expect(query("plumix-island-overlay-badge")?.textContent).toContain("1");

    // jsdom lacks a PromiseRejectionEvent constructor; a plain event with the
    // reason attached is what the listener reads.
    const rejection = new Event("unhandledrejection") as Event & {
      reason: unknown;
    };
    rejection.reason = new Error("rejected boom");
    window.dispatchEvent(rejection);
    await tick();
    expect(query("plumix-island-overlay-badge")?.textContent).toContain("2");
  });

  test("ignores resource-load error events that carry no error object", async () => {
    window.dispatchEvent(new ErrorEvent("error", { message: "404 img" }));
    await tick();
    expect(host()).toBeNull();
  });

  test("dismisses the overlay and clears every captured error", async () => {
    dispatchHydrationError(new Error("boom"), island("Counter"));
    await tick();
    query("plumix-island-overlay-badge")?.click();
    await tick();

    query("plumix-island-overlay-dismiss")?.click();
    await tick();

    // Dismissing clears every error, so the host leaves the DOM entirely.
    expect(host()).toBeNull();
  });

  test("re-surfaces a dismissed error when the same value is dispatched again", async () => {
    const rejectSame = (): void => {
      const event = new Event("unhandledrejection") as Event & {
        reason: unknown;
      };
      event.reason = "boom-string";
      window.dispatchEvent(event);
    };

    rejectSame();
    await tick();
    expect(query("plumix-island-overlay-badge")?.textContent).toContain("1");

    query("plumix-island-overlay-badge")?.click();
    await tick();
    query("plumix-island-overlay-dismiss")?.click();
    await tick();
    expect(host()).toBeNull();

    // Dismiss cleared the dedup memory, so the same primitive surfaces again.
    rejectSame();
    await tick();
    expect(query("plumix-island-overlay-badge")?.textContent).toContain("1");
  });

  test("uninstall removes the host and stops capturing", async () => {
    dispatchHydrationError(new Error("boom"), island("Counter"));
    await tick();
    expect(host()).not.toBeNull();

    uninstall();
    uninstall = () => undefined;
    expect(host()).toBeNull();

    // A later error is no longer captured.
    dispatchHydrationError(new Error("after"), island("Counter"));
    await tick();
    expect(host()).toBeNull();
  });
});
