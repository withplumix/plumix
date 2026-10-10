/// <reference lib="dom" />
// Load only under the dev gate, so this module and its React DOM client weight
// tree-shake out of production island bundles.

import type { ReactElement } from "react";
import type { Root } from "react-dom/client";
import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

import type {
  DevErrorFrame,
  DevErrorHydrationDiff,
  DevErrorInfo,
} from "./contract.js";
import { deriveLabel, detailOf } from "../../blocks/island-events.js";
import { enhanceDevError } from "./enhance.js";
import { DevErrorBody } from "./error-page.js";
import { DEV_ERROR_STACK_ENDPOINT } from "./frames.js";
import { DEV_OVERLAY_CSS, DevOverlayShell } from "./overlay-shell.js";
import { DEV_ERROR_CSS } from "./tokens.js";

const HOST_TAG = "plumix-dev-error-overlay";

interface CapturedError {
  readonly info: DevErrorInfo;
  // Set when the error carried its island element.
  readonly label?: string;
}

// Idempotent: a second install before teardown returns the existing teardown,
// so an HMR re-run of the islands bootstrap never stacks listeners.
let active: IslandErrorOverlay | null = null;

export function installIslandErrorOverlay(target: Window = window): () => void {
  if (active) return active.teardown;
  const overlay = new IslandErrorOverlay(target);
  overlay.install();
  active = overlay;
  return overlay.teardown;
}

class IslandErrorOverlay {
  // Replaced (not mutated) on each change so React and the `ErrorBody` effect
  // see a new reference and reconcile the resolved frames when they arrive.
  private errors: CapturedError[] = [];
  // Identity dedup so a render loop or a doubly-dispatched failure (e.g. the
  // hydration path and the window `error` handler both seeing it) counts once.
  private readonly seenObjects = new WeakSet();
  private readonly seenPrimitives = new Set<string>();
  private active = 0;
  // Set by a genuine capture and consumed (reset) by the next `render`, so only
  // that render pulses the count circle — not a reopen on a settled count.
  private pulseNext = false;
  private expanded = false;
  private host: HTMLElement | null = null;
  private root: Root | null = null;
  // Set on teardown so a late `resolveFrames` POST can't remount the overlay.
  private torndown = false;
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
    this.on("plumix:island-hydration-mismatch", (event) => {
      // No thrown error, since React recovered, so this is a synthesized entry
      // rather than one built by `toDevErrorInfo`.
      const { element, componentStack, server, client } = detailOf(event);
      const diff =
        server !== undefined && client !== undefined
          ? { server, client }
          : undefined;
      this.captureMismatch(element, componentStack, diff);
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
    this.on("keydown", (event) => {
      // Collapse to the indicator without discarding the captured errors.
      if (this.expanded && (event as KeyboardEvent).key === "Escape") {
        this.setExpanded(false);
      }
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
    const entry = this.addEntry(toDevErrorInfo(error, componentStack), element);
    void this.resolveFrames(entry);
  }

  // A hydration mismatch has no thrown error and no JS stack, so it skips frame
  // resolution; React's component stack is the signal.
  private captureMismatch(
    element?: HTMLElement,
    componentStack?: string,
    hydrationDiff?: DevErrorHydrationDiff,
  ): void {
    // Dedup by island + React stack (no error object to key on), so a
    // doubly-dispatched identical mismatch counts once.
    const key = `hydration-mismatch:${deriveLabel(element) ?? ""}:${componentStack ?? ""}`;
    if (this.seenPrimitives.has(key)) return;
    this.seenPrimitives.add(key);
    const info: DevErrorInfo = {
      name: "Hydration mismatch",
      message: HYDRATION_MISMATCH_MESSAGE,
      ...(componentStack !== undefined ? { componentStack } : {}),
      ...(hydrationDiff !== undefined ? { hydrationDiff } : {}),
    };
    this.addEntry(info, element);
  }

  // Push a resolved entry, point the overlay at it, and pulse the count. Shared
  // by the error-capture paths (thrown errors, hydration mismatches).
  private addEntry(info: DevErrorInfo, element?: HTMLElement): CapturedError {
    const label = deriveLabel(element);
    const entry: CapturedError = { info, ...(label ? { label } : {}) };
    this.errors = [entry, ...this.errors];
    // An expanded panel follows the entry being read as it shifts down, so the
    // panel never swaps out from under the developer.
    if (this.expanded) this.active += 1;
    else this.active = 0;
    // A genuine new error just landed — let the next render pulse the circle.
    this.pulseNext = true;
    this.render();
    return entry;
  }

  // Browser stacks point at Vite's served module URLs, so the dev resolver maps
  // them back to the original `file:line` frames.
  private async resolveFrames(entry: CapturedError): Promise<void> {
    const { stack } = entry.info;
    if (!stack) return;
    try {
      const response = await this.target.fetch(DEV_ERROR_STACK_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stack }),
      });
      if (!response.ok) return;
      const { frames } = (await response.json()) as {
        frames?: readonly DevErrorFrame[];
      };
      if (!frames || frames.length === 0) return;
      const index = this.errors.indexOf(entry);
      if (index < 0) return;
      const resolved: CapturedError = {
        ...entry,
        info: { ...entry.info, frames },
      };
      this.errors = this.errors.map((e, i) => (i === index ? resolved : e));
      this.render();
    } catch {
      // Keep the raw stack when the resolver is unreachable.
    }
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
    if (this.torndown) return;
    if (!this.host) this.mountHost();
    this.root?.render(
      <Overlay
        errors={this.errors}
        active={this.active}
        pulse={this.pulseNext}
        expanded={this.expanded}
        shadowRoot={this.host?.shadowRoot ?? null}
        onExpand={() => this.setExpanded(true)}
        onCollapse={() => this.setExpanded(false)}
        onPrev={() => this.step(-1)}
        onNext={() => this.step(1)}
      />,
    );
    // Consume the one-shot pulse: later renders (frame resolution, expand/
    // collapse) must not re-fire the animation.
    this.pulseNext = false;
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

  private setExpanded(expanded: boolean): void {
    this.expanded = expanded;
    this.render();
  }

  private step(delta: number): void {
    const count = this.errors.length;
    this.active = (this.active + delta + count) % count;
    this.render();
  }

  private dispose(): void {
    this.root?.unmount();
    this.root = null;
    this.host?.remove();
    this.host = null;
  }

  readonly teardown = (): void => {
    this.torndown = true;
    for (const off of this.listeners) off();
    this.listeners.length = 0;
    this.dispose();
    if (active === this) active = null;
  };
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
  // True only on the render that follows a genuine new capture, so the count
  // circle animates the tick-up but a reopen on a settled count does not.
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

function ClientErrorBody({
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

// React's own recoverable-error wording is an internal we don't surface.
const HYDRATION_MISMATCH_MESSAGE =
  "The island's server and client renders disagreed. React recovered by " +
  "re-rendering it on the client; the usual cause is a non-deterministic " +
  "render — a Date.now(), Math.random(), or locale/timezone read.";

// Browser stacks arrive raw, so keep the stack string rather than parse frames
// that would point at transformed positions.
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

// The badge reuses the shell's palette, inherited from `:host`; only its layout
// and the count-pulse animation live here.
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
