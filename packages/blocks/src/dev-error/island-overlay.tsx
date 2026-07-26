// The client island error overlay (#1603). A dev-only, non-blocking catch net
// for island failures: it consumes the framework's `plumix:hydration-error`
// event (hydration/mount), the `plumix:island-error` event that the island
// renderer's React root callbacks emit (post-hydration render/effect errors),
// and the global `error` / `unhandledrejection` events (async + event-handler
// leaks). Each captured error becomes a corner badge that expands to the shared
// `DevErrorPage` renderer inside a Shadow DOM root — never full-screen, so the
// server-rendered HTML underneath stays usable. The whole module is pulled in
// only under the dev gate (a lazy `import()` in the islands bootstrap), so it
// tree-shakes out of production island bundles along with the React DOM client
// weight it carries.

import type { ReactElement } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";

import type { DevErrorInfo } from "./contract.js";
import { DevErrorPage } from "./error-page.js";
import { DEV_ERROR_CSS } from "./tokens.js";

const HOST_TAG = "plumix-dev-error-overlay";

/** One captured island failure: the resolved error plus the island it came from. */
interface CapturedError {
  readonly info: DevErrorInfo;
  /** The island's component name, when the error carried its element. */
  readonly label?: string;
}

/**
 * Install the island error overlay on `target` (defaults to `window`). Wires the
 * catch net and returns a teardown that removes the listeners and the mounted
 * host. Idempotent: a second call before teardown returns the existing overlay's
 * teardown, so an HMR re-run of the islands bootstrap never stacks listeners.
 */
let active: IslandErrorOverlay | null = null;

export function installIslandErrorOverlay(target: Window = window): () => void {
  if (active) return active.teardown;
  const overlay = new IslandErrorOverlay(target);
  overlay.install();
  active = overlay;
  return overlay.teardown;
}

class IslandErrorOverlay {
  private readonly errors: CapturedError[] = [];
  // Identity dedup so a render loop or a doubly-dispatched failure (e.g. the
  // hydration path and the window `error` handler both seeing it) counts once.
  // Reset on dismiss so a previously-seen error can surface again afterwards.
  private seenObjects = new WeakSet<object>();
  private seenPrimitives = new Set<string>();
  private active = 0;
  private expanded = false;
  private host: HTMLElement | null = null;
  private root: Root | null = null;
  private readonly listeners: (() => void)[] = [];

  constructor(private readonly target: Window) {}

  install(): void {
    this.on("plumix:hydration-error", (event) => {
      // Cancel the framework's default (a console log) — the overlay owns the
      // surfacing now.
      event.preventDefault();
      const { error, element } = detailOf(event);
      this.capture(error, element);
    });
    this.on("plumix:island-error", (event) => {
      const { error, element, componentStack } = detailOf(event);
      this.capture(error, element, componentStack);
    });
    this.on("error", (event) => {
      // Skip `error` events with no error object — a cross-origin
      // "Script error." or a resource-load 404 — nothing actionable to show.
      // (`ErrorEvent.error` is typed `any`.)
      const error: unknown = (event as ErrorEvent).error;
      if (error == null) return;
      this.capture(error);
    });
    this.on("unhandledrejection", (event) => {
      this.capture((event as { reason?: unknown }).reason);
    });
  }

  private on(type: string, handler: (event: Event) => void): void {
    this.target.addEventListener(type, handler);
    this.listeners.push(() => this.target.removeEventListener(type, handler));
  }

  private capture(
    error: unknown,
    element?: HTMLElement,
    componentStack?: string,
  ): void {
    if (this.isDuplicate(error)) return;
    const label = deriveLabel(element);
    this.errors.unshift({
      info: toDevErrorInfo(error, componentStack),
      ...(label ? { label } : {}),
    });
    // Newest error lands at index 0. A collapsed overlay points at it; an
    // expanded panel follows the entry the developer is reading as it shifts
    // down by one, so the panel never swaps out from under them.
    if (this.expanded) this.active += 1;
    else this.active = 0;
    this.render();
  }

  private isDuplicate(error: unknown): boolean {
    if (error !== null && typeof error === "object") {
      if (this.seenObjects.has(error)) return true;
      this.seenObjects.add(error);
      return false;
    }
    const key = String(error);
    if (this.seenPrimitives.has(key)) return true;
    this.seenPrimitives.add(key);
    return false;
  }

  private render(): void {
    if (this.errors.length === 0) {
      this.dispose();
      return;
    }
    if (!this.host) this.mountHost();
    this.root?.render(
      <Overlay
        errors={this.errors}
        active={this.active}
        expanded={this.expanded}
        onExpand={() => this.setExpanded(true)}
        onCollapse={() => this.setExpanded(false)}
        onDismiss={() => this.dismiss()}
        onPrev={() => this.step(-1)}
        onNext={() => this.step(1)}
      />,
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
    // React 19 attaches its listeners to the mount container, so click handlers
    // work across the shadow boundary. A stray render error in the overlay must
    // not feed back into the catch net, so it is reported to the console only.
    this.root = createRoot(mount, {
      onUncaughtError: (err) => console.error(err),
    });
  }

  private setExpanded(expanded: boolean): void {
    this.expanded = expanded;
    this.render();
  }

  private step(delta: number): void {
    const count = this.errors.length;
    this.active = (this.active + delta + count) % count;
    this.render();
  }

  private dismiss(): void {
    this.errors.length = 0;
    this.active = 0;
    this.expanded = false;
    // Forget what was seen so a recurring error surfaces again after dismissal.
    this.seenObjects = new WeakSet();
    this.seenPrimitives = new Set();
    this.dispose();
  }

  private dispose(): void {
    this.root?.unmount();
    this.root = null;
    this.host?.remove();
    this.host = null;
  }

  readonly teardown = (): void => {
    for (const off of this.listeners) off();
    this.listeners.length = 0;
    this.dispose();
    if (active === this) active = null;
  };
}

function Overlay({
  errors,
  active,
  expanded,
  onExpand,
  onCollapse,
  onDismiss,
  onPrev,
  onNext,
}: {
  readonly errors: readonly CapturedError[];
  readonly active: number;
  readonly expanded: boolean;
  readonly onExpand: () => void;
  readonly onCollapse: () => void;
  readonly onDismiss: () => void;
  readonly onPrev: () => void;
  readonly onNext: () => void;
}): ReactElement {
  const count = errors.length;
  if (!expanded) {
    return (
      <button
        type="button"
        className="plumix-island-overlay__badge"
        data-testid="plumix-island-overlay-badge"
        onClick={onExpand}
      >
        <span aria-hidden="true">▲</span>
        {count} client {count === 1 ? "error" : "errors"}
      </button>
    );
  }
  const entry = errors[active] ?? errors[0];
  return (
    <div
      className="plumix-island-overlay plumix-island-overlay__panel"
      data-testid="plumix-island-overlay-panel"
      role="dialog"
      aria-label="Client error"
    >
      <div className="plumix-island-overlay__bar">
        <span
          className="plumix-island-overlay__label"
          data-testid="plumix-island-overlay-label"
        >
          {entry?.label ?? "Uncaught error"}
        </span>
        {count > 1 ? (
          <span className="plumix-island-overlay__nav">
            <button
              type="button"
              className="plumix-island-overlay__btn"
              data-testid="plumix-island-overlay-prev"
              aria-label="Previous error"
              onClick={onPrev}
            >
              ‹
            </button>
            <span
              className="plumix-island-overlay__count"
              data-testid="plumix-island-overlay-count"
            >
              {active + 1} / {count}
            </span>
            <button
              type="button"
              className="plumix-island-overlay__btn"
              data-testid="plumix-island-overlay-next"
              aria-label="Next error"
              onClick={onNext}
            >
              ›
            </button>
          </span>
        ) : null}
        <button
          type="button"
          className="plumix-island-overlay__btn"
          data-testid="plumix-island-overlay-collapse"
          aria-label="Minimize"
          onClick={onCollapse}
        >
          –
        </button>
        <button
          type="button"
          className="plumix-island-overlay__btn"
          data-testid="plumix-island-overlay-dismiss"
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          ✕
        </button>
      </div>
      <div className="plumix-island-overlay__body">
        {entry ? <DevErrorPage error={entry.info} /> : null}
      </div>
    </div>
  );
}

// Any value can be thrown; a non-`Error` degrades to a named exception carrying
// its string form. Browser stacks arrive raw (unlike the already-sourcemapped
// server stacks), so this keeps the raw stack string rather than parsing frames
// that would point at transformed positions — the renderer shows it verbatim.
function toDevErrorInfo(error: unknown, componentStack?: string): DevErrorInfo {
  const componentPart = componentStack !== undefined ? { componentStack } : {};
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
      ...componentPart,
    };
  }
  return { name: "UnknownError", message: String(error), ...componentPart };
}

function deriveLabel(element?: HTMLElement): string | undefined {
  const name = element?.getAttribute("component-export");
  return name ? `<${name}>` : undefined;
}

interface ErrorDetail {
  readonly error?: unknown;
  readonly element?: HTMLElement;
  readonly componentStack?: string;
}

function detailOf(event: Event): ErrorDetail {
  const detail = (event as CustomEvent<unknown>).detail;
  return detail !== null && typeof detail === "object" ? detail : {};
}

// The overlay chrome — the corner badge and the expandable panel. The panel is
// deliberately bounded (a fixed corner box, capped width/height) so it is never
// a full-screen takeover, and it overrides the shared sheet's full-page metrics
// on the `DevErrorPage` it wraps.
const OVERLAY_CSS = `
:host {
  all: initial;
}

.plumix-island-overlay {
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

.plumix-island-overlay__badge {
  position: fixed;
  left: 1rem;
  bottom: 1rem;
  z-index: 2147483647;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.875rem;
  background: #ff6b6b;
  color: #16181d;
  border: none;
  border-radius: 999px;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
    Helvetica, Arial, sans-serif;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
}

.plumix-island-overlay__panel {
  position: fixed;
  left: 1rem;
  bottom: 1rem;
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  width: min(38rem, calc(100vw - 2rem));
  max-height: min(80vh, 44rem);
  background: var(--plumix-ov-bg);
  border: 1px solid var(--plumix-ov-border);
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.plumix-island-overlay__bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.625rem;
  border-bottom: 1px solid var(--plumix-ov-border);
  background: var(--plumix-ov-surface);
}

.plumix-island-overlay__label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--plumix-ov-fg);
}

.plumix-island-overlay__nav {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.plumix-island-overlay__count {
  min-width: 2.5rem;
  text-align: center;
  font-size: 0.75rem;
  color: var(--plumix-ov-muted);
  font-variant-numeric: tabular-nums;
}

.plumix-island-overlay__btn {
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

.plumix-island-overlay__btn:hover {
  color: var(--plumix-ov-fg);
  border-color: var(--plumix-ov-accent);
}

.plumix-island-overlay__body {
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--plumix-ov-border) transparent;
}

.plumix-island-overlay__body .plumix-dev-error {
  min-height: 0;
  padding: 1.25rem;
}

/* In the narrow panel, wrap long stack lines instead of a jarring horizontal
   scrollbar (the full-width server page keeps them on one line). */
.plumix-island-overlay__body .plumix-dev-error__stack pre,
.plumix-island-overlay__body .plumix-dev-error__component-stack-pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  overflow-x: visible;
}
`;
