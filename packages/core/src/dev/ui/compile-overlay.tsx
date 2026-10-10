/// <reference lib="dom" />
// Plumix disables Vite's own overlay (`server.hmr.overlay: false`) so the two
// never stack. Load only behind the dev gate: the React DOM client weight must
// tree-shake from production.

import type { ReactElement } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";

import type { DevErrorInfo } from "./contract.js";
import { DevErrorBody } from "./error-page.js";
import { DEV_OVERLAY_CSS, DevOverlayShell } from "./overlay-shell.js";
import { DEV_ERROR_CSS } from "./tokens.js";

const HOST_TAG = "plumix-compile-error-overlay";

// The erroring module recompiled or the page is reloading, so the fix landed.
// Vite clears its own overlay on `vite:beforeUpdate` for the same reason.
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
 * Structural so a test can pass a fake and `@plumix/core` needn't depend on
 * `vite`.
 */
export interface HmrClient {
  on(event: string, cb: (payload?: { err?: ViteErrorPayload }) => void): void;
  off?(event: string, cb: (payload?: { err?: ViteErrorPayload }) => void): void;
}

/**
 * Compile errors carry no resolvable JS stack, so Vite's own code frame is
 * shown verbatim in the stack view.
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
   * A `vite:error` that fired before this lazy install subscribed. Vite's own
   * overlay is disabled, so without the replay the error is lost.
   */
  readonly initialError?: { readonly err?: ViteErrorPayload };
}

let active: CompileErrorOverlay | null = null;

/**
 * Idempotent: a second call before teardown, e.g. an HMR re-run of the client
 * entry, returns the existing teardown rather than stacking listeners.
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

// `DevErrorBody`, not the full `DevErrorPage`, so the overlay never mounts
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
