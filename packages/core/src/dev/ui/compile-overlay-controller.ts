// The compile overlay's rules, apart from its DOM: which HMR events show and
// clear it, and what a dismissal or a teardown does.

/**
 * The subset of Vite's `ErrorPayload['err']` the overlay reads. Kept as a
 * local structural type so `@plumix/core` needs no `vite` dependency.
 */
export interface ViteErrorPayload {
  readonly message?: string;
  /** The JS stack, when the error carried one (rare for transform errors). */
  readonly stack?: string;
  /** The code frame Vite computed — the offending lines with a caret. */
  readonly frame?: string;
  /** The plugin that threw, e.g. `vite:import-analysis`. */
  readonly plugin?: string;
  readonly loc?: {
    readonly file?: string;
    readonly line?: number;
    readonly column?: number;
  };
}

/**
 * Structural so a test can pass a fake and `@plumix/core` needn't depend on
 * `vite`.
 */
export interface HmrClient {
  on(event: string, cb: (payload?: { err?: ViteErrorPayload }) => void): void;
  off?(event: string, cb: (payload?: { err?: ViteErrorPayload }) => void): void;
}

/** What the controller drives: the overlay's DOM, or a test's fake. */
export interface CompileOverlayView {
  show(error: ViteErrorPayload): void;
  hide(): void;
}

export interface CompileOverlayController {
  /** Hides the shown error until the next one arrives. */
  dismiss(): void;
  /** Unsubscribes from the HMR client and hides the overlay for good. */
  readonly teardown: () => void;
}

/**
 * The erroring module recompiled or the page is reloading, so the fix landed.
 * Vite clears its own overlay on `vite:beforeUpdate` for the same reason.
 */
const CLEAR_EVENTS = [
  "vite:beforeUpdate",
  "vite:afterUpdate",
  "vite:beforeFullReload",
] as const;

let active: CompileOverlayController | null = null;

/**
 * Idempotent: a second call before teardown, e.g. an HMR re-run of the client
 * entry, returns the existing controller rather than stacking listeners.
 */
export function createCompileOverlayController(
  hot: HmrClient,
  view: CompileOverlayView,
  initialError?: { readonly err?: ViteErrorPayload },
): CompileOverlayController {
  if (active) return active;
  let shown = false;
  let torndown = false;
  // Tracked so teardown removes the HMR subscriptions (Vite's `hot.off`) and a
  // late event after teardown can't remount the overlay.
  const handlers: {
    readonly event: string;
    readonly handler: (payload?: { err?: ViteErrorPayload }) => void;
  }[] = [];

  function subscribe(
    event: string,
    handler: (payload?: { err?: ViteErrorPayload }) => void,
  ): void {
    hot.on(event, handler);
    handlers.push({ event, handler });
  }

  function show(err: ViteErrorPayload | undefined): void {
    if (torndown || !err) return;
    shown = true;
    view.show(err);
  }

  function hide(): void {
    if (!shown) return;
    shown = false;
    view.hide();
  }

  const controller: CompileOverlayController = {
    dismiss: hide,
    teardown: () => {
      torndown = true;
      for (const { event, handler } of handlers) hot.off?.(event, handler);
      handlers.length = 0;
      hide();
      if (active === controller) active = null;
    },
  };

  subscribe("vite:error", (payload) => show(payload?.err));
  for (const event of CLEAR_EVENTS) subscribe(event, hide);
  // Replay an error that arrived before this listener was wired (the page
  // loaded onto an already-broken module).
  show(initialError?.err);
  active = controller;
  return controller;
}
