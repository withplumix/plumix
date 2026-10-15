/// <reference lib="dom" />
// Plumix disables Vite's own overlay (`server.hmr.overlay: false`) so the two
// never stack. Load only behind the dev gate: the React DOM client weight must
// tree-shake from production.

import type { ReactElement } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";

import type {
  CompileOverlayView,
  HmrClient,
  ViteErrorPayload,
} from "./compile-overlay-controller.js";
import type { DevErrorInfo } from "./contract.js";
import { createCompileOverlayController } from "./compile-overlay-controller.js";
import { DevErrorBody } from "./error-page.js";
import { DEV_OVERLAY_CSS, DevOverlayShell } from "./overlay-shell.js";
import { DEV_ERROR_CSS } from "./tokens.js";

const HOST_TAG = "plumix-compile-error-overlay";

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

/**
 * Idempotent: a second call before teardown, e.g. an HMR re-run of the client
 * entry, returns the existing teardown rather than stacking listeners.
 */
export function installCompileErrorOverlay(
  hot: HmrClient,
  options: InstallOptions = {},
): () => void {
  const view = new CompileOverlayDom(options.target ?? window, () =>
    controller.dismiss(),
  );
  const controller = createCompileOverlayController(
    hot,
    view,
    options.initialError,
  );
  return controller.teardown;
}

/** Mounts the overlay on the first error shown, and unmounts it on hide. */
class CompileOverlayDom implements CompileOverlayView {
  private host: HTMLElement | null = null;
  private root: Root | null = null;
  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") this.onClose();
  };

  constructor(
    private readonly target: Window,
    private readonly onClose: () => void,
  ) {}

  show(error: ViteErrorPayload): void {
    if (!this.root) this.mountHost();
    this.root?.render(
      <CompileModal info={compileErrorToInfo(error)} onClose={this.onClose} />,
    );
  }

  hide(): void {
    this.target.removeEventListener("keydown", this.onKeydown);
    this.root?.unmount();
    this.root = null;
    this.host?.remove();
    this.host = null;
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
    this.target.addEventListener("keydown", this.onKeydown);
  }
}

/**
 * `DevErrorBody`, not the full `DevErrorPage`, so the overlay never mounts
 * the server-only context sections.
 */
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
