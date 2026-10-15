/// <reference lib="dom" />
// Load only under the dev gate, so this module and its React DOM client weight
// tree-shake out of production island bundles.

import type { ReactElement } from "react";
import type { Root } from "react-dom/client";
import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

import type { DevErrorFrame } from "./contract.js";
import type {
  CapturedError,
  IslandErrorLog,
  IslandErrorLogState,
} from "./island-error-log.js";
import { enhanceDevError } from "./enhance.js";
import { DevErrorBody } from "./error-page.js";
import { DEV_ERROR_STACK_ENDPOINT } from "./frames.js";
import { createIslandErrorLog } from "./island-error-log.js";
import { DEV_OVERLAY_CSS, DevOverlayShell } from "./overlay-shell.js";
import { DEV_ERROR_CSS } from "./tokens.js";

const HOST_TAG = "plumix-dev-error-overlay";

/**
 * Idempotent: a second install before teardown returns the existing teardown,
 * so an HMR re-run of the islands bootstrap never stacks listeners.
 */
let active: IslandErrorOverlay | null = null;

export function installIslandErrorOverlay(target: Window = window): () => void {
  if (active) return active.teardown;
  active = new IslandErrorOverlay(target);
  return active.teardown;
}

/** Mounts on the first capture and renders every change the log reports. */
class IslandErrorOverlay {
  private host: HTMLElement | null = null;
  private root: Root | null = null;
  private readonly log: IslandErrorLog;
  private readonly onKeydown = (event: KeyboardEvent): void => {
    // Collapse to the indicator without discarding the captured errors.
    if (event.key === "Escape") this.log.collapse();
  };

  constructor(private readonly target: Window) {
    this.log = createIslandErrorLog(target, {
      resolveFrames: (stack) => fetchFrames(target, stack),
      onChange: (state) => this.render(state),
    });
    target.addEventListener("keydown", this.onKeydown);
  }

  private render(state: IslandErrorLogState): void {
    if (!this.host) this.mountHost();
    this.root?.render(
      <Overlay
        {...state}
        shadowRoot={this.host?.shadowRoot ?? null}
        onExpand={() => this.log.expand()}
        onCollapse={() => this.log.collapse()}
        onPrev={() => this.log.step(-1)}
        onNext={() => this.log.step(1)}
      />,
    );
  }

  private mountHost(): void {
    const host = this.target.document.createElement(HOST_TAG);
    const shadow = host.attachShadow({ mode: "open" });
    const style = this.target.document.createElement("style");
    style.textContent = `${DEV_ERROR_CSS}\n${DEV_OVERLAY_CSS}\n${BADGE_CSS}`;
    const mount = this.target.document.createElement("div");
    shadow.append(style, mount);
    this.target.document.body.appendChild(host);
    this.host = host;
    // A render error in the overlay must not feed back into the catch net, so
    // it goes to the console only.
    this.root = createRoot(mount, {
      onUncaughtError: (err) => console.error(err),
    });
  }

  readonly teardown = (): void => {
    this.log.teardown();
    this.target.removeEventListener("keydown", this.onKeydown);
    this.root?.unmount();
    this.root = null;
    this.host?.remove();
    this.host = null;
    if (active === this) active = null;
  };
}

/** The dev server's resolver, which holds Vite's per-module sourcemaps. */
async function fetchFrames(
  target: Window,
  stack: string,
): Promise<readonly DevErrorFrame[] | undefined> {
  const response = await target.fetch(DEV_ERROR_STACK_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ stack }),
  });
  if (!response.ok) return undefined;
  const { frames } = (await response.json()) as {
    frames?: readonly DevErrorFrame[];
  };
  return frames;
}

function Overlay({
  errors,
  active,
  pulse,
  expanded,
  shadowRoot,
  onExpand,
  onCollapse,
  onPrev,
  onNext,
}: {
  readonly errors: readonly CapturedError[];
  readonly active: number;
  /**
   * True only on the render that follows a genuine new capture, so the count
   * circle animates the tick-up but a reopen on a settled count does not.
   */
  readonly pulse: boolean;
  readonly expanded: boolean;
  readonly shadowRoot: ShadowRoot | null;
  readonly onExpand: () => void;
  readonly onCollapse: () => void;
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
        {/* Keyed on the count so each new error remounts the circle and replays
            the pulse animation. */}
        <span
          key={count}
          className={
            pulse
              ? "plumix-island-overlay__badge-count plumix-island-overlay__badge-count--pulse"
              : "plumix-island-overlay__badge-count"
          }
          data-testid="plumix-island-overlay-badge-count"
        >
          {count}
        </span>
        {count === 1 ? "error" : "errors"}
      </button>
    );
  }
  const entry = errors[active] ?? errors[0];
  return (
    <DevOverlayShell
      label={entry?.label ?? "Uncaught error"}
      ariaLabel="Client error"
      onClose={onCollapse}
      actions={
        count > 1 ? (
          <span className="plumix-dev-overlay__nav">
            <button
              type="button"
              className="plumix-dev-overlay__btn"
              data-testid="plumix-island-overlay-prev"
              aria-label="Previous error"
              onClick={onPrev}
            >
              ‹
            </button>
            <span
              className="plumix-dev-overlay__count"
              data-testid="plumix-island-overlay-count"
            >
              {active + 1} / {count}
            </span>
            <button
              type="button"
              className="plumix-dev-overlay__btn"
              data-testid="plumix-island-overlay-next"
              aria-label="Next error"
              onClick={onNext}
            >
              ›
            </button>
          </span>
        ) : null
      }
    >
      {entry ? (
        // Keyed by position so navigating remounts it — fresh DOM for the
        // excerpt enhancer to wire, and no stale listeners from the last one.
        <ClientErrorBody key={active} entry={entry} shadowRoot={shadowRoot} />
      ) : null}
    </DevOverlayShell>
  );
}

/**
 * `DevErrorBody`, not the full `DevErrorPage`, so the dialog never shows the
 * server-only context sections.
 */
export function ClientErrorBody({
  entry,
  shadowRoot,
}: {
  readonly entry: CapturedError;
  readonly shadowRoot: ShadowRoot | null;
}): ReactElement {
  const { frames } = entry.info;
  // The enhancer wires click listeners and fires the first excerpt fetch; run
  // it exactly once (a StrictMode double-invoke or dep change must not
  // double-wire).
  const enhanced = useRef(false);
  useEffect(() => {
    if (enhanced.current) return;
    if (frames && frames.length > 0 && shadowRoot) {
      enhanced.current = true;
      enhanceDevError(shadowRoot);
    }
  }, [frames, shadowRoot]);
  return <DevErrorBody error={entry.info} />;
}

/**
 * The badge reuses the shell's palette, inherited from `:host`; only its layout
 * and the count-pulse animation live here.
 */
const BADGE_CSS = `
.plumix-island-overlay__badge {
  position: fixed;
  left: 1rem;
  bottom: 1rem;
  z-index: 2147483647;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.75rem 0.375rem 0.375rem;
  background: var(--plumix-ov-bg);
  color: var(--plumix-ov-fg);
  border: 1px solid var(--plumix-ov-border);
  border-radius: 999px;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
}

.plumix-island-overlay__badge-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.375rem;
  height: 1.375rem;
  padding: 0 0.25rem;
  border-radius: 999px;
  background: var(--plumix-ov-accent);
  color: #16181d;
  font-size: 0.75rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* The circle pulses only when the count climbs (the modifier is applied for
   that render, on a node remounted by its key), so a burst of errors makes the
   number visibly throb while a settled count sits still — the "still arriving
   vs. stable" signal, right on the badge (#1623). */
.plumix-island-overlay__badge-count--pulse {
  animation: plumix-island-overlay__count-pulse 420ms ease;
}

@keyframes plumix-island-overlay__count-pulse {
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(255, 107, 107, 0.5);
  }
  35% {
    transform: scale(1.35);
    box-shadow: 0 0 0 5px rgba(255, 107, 107, 0);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(255, 107, 107, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .plumix-island-overlay__badge-count--pulse {
    animation: none;
  }
}
`;
