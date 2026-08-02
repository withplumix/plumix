/// <reference lib="dom" />
// The client compile/import error overlay (#1622). Vite owns compile and import
// errors, and its built-in overlay is visually and behaviorally disjoint from
// the plumix dev error surface (the server `DevErrorPage` and the island
// overlay). This module intercepts Vite's HMR `vite:error` payload and renders
// it through the *same* shared `DevErrorPage` renderer + token sheet, inside a
// Shadow DOM modal, so a syntax error or a bad import reads like every other
// dev error. Plumix disables Vite's own overlay (`server.hmr.overlay: false`)
// so the two never stack. The whole module is pulled in only behind the dev
// gate (a lazy `import()` from the generated client entry, guarded by
// `import.meta.hot`), so it — and the React DOM client weight it carries —
// tree-shakes out of the production client bundle.

import type { ReactElement } from "react";
import type { Root } from "react-dom/client";
import { useRef } from "react";
import { createRoot } from "react-dom/client";

import type { DevErrorInfo } from "./contract.js";
import { DevErrorPage } from "./error-page.js";
import { DEV_ERROR_CSS } from "./tokens.js";

const HOST_TAG = "plumix-compile-error-overlay";

// Vite HMR lifecycle events that mean the erroring module recompiled (or the
// page is about to reload) — the fix landed, so drop the overlay. Vite clears
// its own overlay on `vite:beforeUpdate` for the same reason.
const CLEAR_EVENTS = [
  "vite:beforeUpdate",
  "vite:afterUpdate",
  "vite:beforeFullReload",
] as const;

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
 * The slice of Vite's `import.meta.hot` (`ViteHotContext`) the overlay uses.
 * Structural so a test can pass a fake and the generated client entry can pass
 * the real `import.meta.hot` without `@plumix/core` depending on `vite`.
 */
export interface HmrClient {
  on(event: string, cb: (payload?: { err?: ViteErrorPayload }) => void): void;
  off?(event: string, cb: (payload?: { err?: ViteErrorPayload }) => void): void;
}

/**
 * Map a Vite error payload onto the shared {@link DevErrorInfo} the renderer
 * consumes. Compile errors carry no resolvable JS stack, so the code frame Vite
 * already computed (with its caret) is shown verbatim in the stack view — the
 * header, hints, and token sheet come straight from the shared page.
 */
export function compileErrorToInfo(err: ViteErrorPayload): DevErrorInfo {
  const message = firstLine(err.message) || "Compile error";
  const detail: string[] = [];
  const location = locationLine(err.loc);
  if (location) detail.push(location);
  if (err.frame?.trim()) {
    detail.push(err.frame);
  } else if (err.stack?.trim()) {
    detail.push(err.stack);
  }
  const stack = detail.join("\n\n");
  return {
    name: err.plugin ? `Compile error · ${err.plugin}` : "Compile error",
    message,
    ...(stack ? { stack } : {}),
  };
}

function firstLine(text: string | undefined): string {
  return (text ?? "").split("\n")[0]?.trim() ?? "";
}

function locationLine(loc: ViteErrorPayload["loc"]): string | null {
  if (!loc?.file) return null;
  if (loc.line === undefined) return loc.file;
  const column = loc.column !== undefined ? `:${loc.column}` : "";
  return `${loc.file}:${loc.line}${column}`;
}

/** Options for {@link installCompileErrorOverlay}. */
export interface InstallOptions {
  /** The window to attach to; defaults to the global `window`. */
  readonly target?: Window;
  /**
   * A `vite:error` payload Vite broadcast *before* this overlay's listener was
   * wired — the page was loaded while the module was already broken, so the
   * event raced the overlay's own (lazily-imported) subscription. The caller
   * buffers it synchronously and hands it here to replay on install, so the
   * error still surfaces instead of being lost now that Vite's own overlay
   * (which listens synchronously) is disabled.
   */
  readonly initialError?: { readonly err?: ViteErrorPayload };
}

let active: CompileErrorOverlay | null = null;

/**
 * Install the compile-error overlay: subscribe to `hot`'s `vite:error` (show)
 * and update (clear) events, and to `Escape` on `target`. Returns a teardown
 * that unsubscribes and removes the mounted host. Idempotent — a second call
 * before teardown (e.g. an HMR re-run of the client entry) returns the existing
 * overlay's teardown rather than stacking listeners.
 */
export function installCompileErrorOverlay(
  hot: HmrClient,
  options: InstallOptions = {},
): () => void {
  if (active) return active.teardown;
  const overlay = new CompileErrorOverlay(
    hot,
    options.target ?? window,
    options.initialError,
  );
  overlay.install();
  active = overlay;
  return overlay.teardown;
}

class CompileErrorOverlay {
  private info: DevErrorInfo | null = null;
  private host: HTMLElement | null = null;
  private root: Root | null = null;
  private torndown = false;
  // Tracked so teardown removes the HMR subscriptions (Vite's `hot.off`) and a
  // late event after teardown can't remount the overlay.
  private readonly hmrHandlers: {
    readonly event: string;
    readonly handler: (payload?: { err?: ViteErrorPayload }) => void;
  }[] = [];
  private readonly onKeydown: (event: KeyboardEvent) => void;

  constructor(
    private readonly hot: HmrClient,
    private readonly target: Window,
    private readonly initialError?: { readonly err?: ViteErrorPayload },
  ) {
    this.onKeydown = (event) => {
      if (this.info && event.key === "Escape") this.hide();
    };
  }

  install(): void {
    this.onHmr("vite:error", (payload) => this.show(payload?.err));
    for (const event of CLEAR_EVENTS) this.onHmr(event, () => this.hide());
    this.target.addEventListener("keydown", this.onKeydown);
    // Replay an error that arrived before this listener was wired (the page
    // loaded onto an already-broken module).
    if (this.initialError?.err) this.show(this.initialError.err);
  }

  private onHmr(
    event: string,
    handler: (payload?: { err?: ViteErrorPayload }) => void,
  ): void {
    this.hot.on(event, handler);
    this.hmrHandlers.push({ event, handler });
  }

  private show(err: ViteErrorPayload | undefined): void {
    if (this.torndown || !err) return;
    this.info = compileErrorToInfo(err);
    this.render();
  }

  private hide(): void {
    if (!this.info) return;
    this.info = null;
    this.dispose();
  }

  private render(): void {
    if (this.torndown || !this.info) return;
    if (!this.host) this.mountHost();
    this.root?.render(
      <CompileModal info={this.info} onClose={() => this.hide()} />,
    );
  }

  private mountHost(): void {
    const host = this.target.document.createElement(HOST_TAG);
    const shadow = host.attachShadow({ mode: "open" });
    const style = this.target.document.createElement("style");
    style.textContent = `${DEV_ERROR_CSS}\n${OVERLAY_CSS}`;
    const mount = this.target.document.createElement("div");
    shadow.append(style, mount);
    this.target.document.body.appendChild(host);
    this.host = host;
    // A stray render error in the overlay must not feed back into any catch net
    // — report it to the console only.
    this.root = createRoot(mount, {
      onUncaughtError: (error) => console.error(error),
    });
  }

  private dispose(): void {
    this.root?.unmount();
    this.root = null;
    this.host?.remove();
    this.host = null;
  }

  readonly teardown = (): void => {
    this.torndown = true;
    this.target.removeEventListener("keydown", this.onKeydown);
    for (const { event, handler } of this.hmrHandlers) {
      this.hot.off?.(event, handler);
    }
    this.hmrHandlers.length = 0;
    this.dispose();
    if (active === this) active = null;
  };
}

// The overlay chrome — a centered modal over a dimmed backdrop (the same shape
// as the island overlay), inside a Shadow DOM root. The body renders the shared
// `DevErrorPage`, so the compile error reads like every other dev error.
function CompileModal({
  info,
  onClose,
}: {
  readonly info: DevErrorInfo;
  readonly onClose: () => void;
}): ReactElement {
  const pressedBackdrop = useRef(false);
  return (
    <div
      className="plumix-compile-overlay plumix-compile-overlay__backdrop"
      data-testid="plumix-compile-overlay-backdrop"
      onMouseDown={(event) => {
        // Only close on a press that both began and ended on the backdrop, so a
        // text selection dragged out of the modal doesn't dismiss it.
        pressedBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && pressedBackdrop.current) {
          onClose();
        }
      }}
    >
      <div
        className="plumix-compile-overlay__modal"
        data-testid="plumix-compile-overlay-panel"
        role="dialog"
        aria-label="Compile error"
      >
        <div className="plumix-compile-overlay__bar">
          {/* A static window title — the body header already carries the
              specific error name and plugin, so echoing it here would double up. */}
          <span
            className="plumix-compile-overlay__label"
            data-testid="plumix-compile-overlay-label"
          >
            Compile error
          </span>
          <button
            type="button"
            className="plumix-compile-overlay__btn"
            data-testid="plumix-compile-overlay-close"
            aria-label="Dismiss"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="plumix-compile-overlay__body">
          <DevErrorPage error={info} />
        </div>
      </div>
    </div>
  );
}

// The modal/backdrop shell deliberately duplicates `island-overlay.tsx`'s
// chrome rather than sharing it: the two diverge in their per-surface class
// prefixes and extra parts (that overlay's badge/nav), so a shared sheet would
// be a prefix-parameterized generator — harder to read than these two flat
// strings, and unifying it would mean editing that already-shipped, tested
// overlay. Kept separate on purpose; revisit only as a dedicated refactor.
const OVERLAY_CSS = `
:host {
  all: initial;
}

.plumix-compile-overlay {
  --plumix-ov-bg: #16181d;
  --plumix-ov-surface: #1e2128;
  --plumix-ov-fg: #e6e8eb;
  --plumix-ov-muted: #9aa0aa;
  --plumix-ov-accent: #ff6b6b;
  --plumix-ov-border: #2c3038;
  --plumix-ov-font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
    Helvetica, Arial, sans-serif;
  font-family: var(--plumix-ov-font);
}

.plumix-compile-overlay__backdrop {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(1rem, 5vh, 3rem) clamp(1rem, 5vw, 3rem);
  background: rgba(0, 0, 0, 0.5);
}

.plumix-compile-overlay__modal {
  display: flex;
  flex-direction: column;
  width: min(44rem, 100%);
  max-height: 100%;
  background: var(--plumix-ov-bg);
  border: 1px solid var(--plumix-ov-border);
  border-radius: 12px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
  overflow: hidden;
}

.plumix-compile-overlay__bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.625rem;
  border-bottom: 1px solid var(--plumix-ov-border);
  background: var(--plumix-ov-surface);
}

.plumix-compile-overlay__label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--plumix-ov-fg);
}

.plumix-compile-overlay__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.75rem;
  height: 1.75rem;
  padding: 0 0.375rem;
  background: transparent;
  color: var(--plumix-ov-muted);
  border: 1px solid var(--plumix-ov-border);
  border-radius: 6px;
  font-family: inherit;
  font-size: 0.9375rem;
  line-height: 1;
  cursor: pointer;
}

.plumix-compile-overlay__btn:hover {
  color: var(--plumix-ov-fg);
  border-color: var(--plumix-ov-accent);
}

.plumix-compile-overlay__body {
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--plumix-ov-border) transparent;
}

.plumix-compile-overlay__body .plumix-dev-error {
  min-height: 0;
  padding: 1.25rem;
}

/* Wrap the code frame instead of a jarring horizontal scrollbar. */
.plumix-compile-overlay__body .plumix-dev-error__stack pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  overflow-x: visible;
}
`;
