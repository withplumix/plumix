/// <reference lib="dom" />
// The client island error overlay (#1603). A dev-only catch net for island
// failures: it consumes the framework's `plumix:hydration-error` event
// (hydration/mount), the `plumix:island-error` event that the island renderer's
// React root callbacks emit (post-hydration render/effect errors), and the
// global `error` / `unhandledrejection` events (async + event-handler leaks).
// Errors are counted on a small, non-blocking bottom-left indicator that opens a
// slim client dialog — the shared error body inside the shared overlay shell
// (#1678), a centered modal over a dimmed backdrop (the Next.js dev-overlay
// shape), inside a Shadow DOM root; Escape, the close button, or a backdrop
// click returns to the indicator, and the page stays visible behind — the
// server-rendered HTML is the floor. The whole module is
// pulled in only under the dev gate (a lazy `import()` in the islands
// bootstrap), so it tree-shakes out of production island bundles along with the
// React DOM client weight it carries.

import type { ReactElement } from "react";
import type { Root } from "react-dom/client";
import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

import { deriveLabel, detailOf } from "@plumix/blocks/island-events";

import type {
  DevErrorFrame,
  DevErrorHydrationDiff,
  DevErrorInfo,
} from "./contract.js";
import { enhanceDevError } from "./enhance.js";
import { DevErrorBody } from "./error-page.js";
import { DEV_ERROR_STACK_ENDPOINT } from "./frames.js";
import { DEV_OVERLAY_CSS, DevOverlayShell } from "./overlay-shell.js";
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
      // A dev-hydrating island whose server and client renders disagreed
      // (#1667). No thrown error — React recovered — so this renders as its own
      // synthesized entry rather than through `toDevErrorInfo`. The captured
      // server/client pair (#1668) recombines into the diff the page renders.
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

  // A hydration mismatch (#1667) carries no thrown error and no JS stack —
  // React's component stack is the signal — so it maps straight into the shared
  // resolved-error contract and skips frame resolution. The captured server/
  // client HTML pair (#1668), when present, becomes the diff the page renders.
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
    // Newest error lands at index 0. A collapsed overlay points at it; an
    // expanded panel follows the entry the developer is reading as it shifts
    // down by one, so the panel never swaps out from under them.
    if (this.expanded) this.active += 1;
    else this.active = 0;
    // A genuine new error just landed — let the next render pulse the circle.
    this.pulseNext = true;
    this.render();
    return entry;
  }

  // Browser stacks are unmapped — they point at Vite's served module URLs, not
  // original source — so POST the raw stack to the dev resolver (#1572) and swap
  // in the original `file:line` frames when they return, giving the overlay the
  // same frame view the (already-sourcemapped) server page shows.
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
            the pulse animation; `pulse` gates whether this render is a genuine
            tick-up — the burst signal lives on the number itself, no second
            element. */}
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

// The island dialog body: renders one captured island failure through the shared
// slim {@link DevErrorBody} — the label, the error, and the hydration diff, none
// of the server-only context sections. Once the resolved frames have arrived and
// committed, it wires frame-click → source excerpt against the shadow root (the
// same enhancer the server page runs against `document`).
function ClientErrorBody({
  entry,
  shadowRoot,
}: {
  readonly entry: CapturedError;
  readonly shadowRoot: ShadowRoot | null;
}): ReactElement {
  const { frames } = entry.info;
  // The enhancer wires click listeners and fires the first excerpt fetch; run it
  // exactly once (a StrictMode double-invoke or dep change must not double-wire).
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

// The synthesized message for a hydration mismatch — React's own recoverable-
// error wording is an internal we don't surface. A dev-only English string,
// matching the framework's error voice, that names the usual culprit.
const HYDRATION_MISMATCH_MESSAGE =
  "The island's server and client renders disagreed. React recovered by " +
  "re-rendering it on the client; the usual cause is a non-deterministic " +
  "render — a Date.now(), Math.random(), or locale/timezone read.";

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

// The island-only chrome: the small bottom-left indicator that opens the shared
// overlay shell (#1678). Expanding it mounts {@link DevOverlayShell} — the
// centered, bounded modal over a dimmed backdrop, so the server-rendered page
// stays visible behind it and closing returns to the indicator. The badge reuses
// the shell's palette (inherited from `:host` via `DEV_OVERLAY_CSS`); only its
// layout and the count-pulse animation live here.
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
