/// <reference lib="dom" />
// The client compile/import error overlay (#1622). Vite owns compile and import
// errors, and its built-in overlay is visually and behaviorally disjoint from
// the plumix dev error surface (the server dev error page and the island
// dialog). This module intercepts Vite's HMR `vite:error` payload and renders it
// through the *same* shared error renderer + token sheet, inside the shared
// overlay shell's Shadow DOM modal (#1678), so a syntax error or a bad import
// reads like every other dev error. Plumix disables Vite's own overlay
// (`server.hmr.overlay: false`) so the two never stack. The whole module is
// pulled in only behind the dev gate (a lazy `import()` from the generated
// client entry, guarded by `import.meta.hot`), so it — and the React DOM client
// weight it carries — tree-shakes out of the production client bundle.

import type { ReactElement } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";

import type { DevErrorInfo } from "./contract.js";
import { DevErrorBody } from "./error-page.js";
import { DEV_OVERLAY_CSS, DevOverlayShell } from "./overlay-shell.js";
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
    style.textContent = `${DEV_ERROR_CSS}\n${DEV_OVERLAY_CSS}`;
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

// The compile surface composes the shared overlay shell (#1678): a static
// "Compile error" window title — the body header already carries the specific
// error name and plugin — over the shared slim body. `DevErrorBody` (not the full
// `DevErrorPage`) renders the exception + code frame, so the overlay never mounts
// the server-only context sections.
function CompileModal({
  info,
  onClose,
}: {
  readonly info: DevErrorInfo;
  readonly onClose: () => void;
}): ReactElement {
  return (
    <DevOverlayShell
      label="Compile error"
      ariaLabel="Compile error"
      onClose={onClose}
    >
      <DevErrorBody error={info} />
    </DevOverlayShell>
  );
}
