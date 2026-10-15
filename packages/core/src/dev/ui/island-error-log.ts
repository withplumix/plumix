// The island overlay's state, apart from its DOM: what it captured, which
// entry is shown, and when the count pulses.

import type {
  DevErrorFrame,
  DevErrorHydrationDiff,
  DevErrorInfo,
} from "./contract.js";
import { deriveLabel, detailOf } from "../../blocks/island-events.js";

export interface CapturedError {
  readonly info: DevErrorInfo;
  /** Set when the error carried its island element. */
  readonly label?: string;
}

export interface IslandErrorLogState {
  /** Newest first. */
  readonly errors: readonly CapturedError[];
  /** The index of the entry the expanded dialog shows. */
  readonly active: number;
  readonly expanded: boolean;
  /**
   * True only on the change a genuine new capture caused, so the count circle
   * animates the tick-up but a reopen on a settled count does not.
   */
  readonly pulse: boolean;
}

export interface IslandErrorLogOptions {
  /**
   * Maps a raw browser stack to source frames; `undefined`, or a rejection,
   * keeps the raw stack.
   */
  readonly resolveFrames: (
    stack: string,
  ) => Promise<readonly DevErrorFrame[] | undefined>;
  /** Called with the new state on every change until teardown. */
  readonly onChange: (state: IslandErrorLogState) => void;
}

export interface IslandErrorLog {
  expand(): void;
  /** Collapses to the badge, keeping the captured errors. */
  collapse(): void;
  /** Moves the shown entry by `delta`, wrapping at either end. */
  step(delta: number): void;
  /** Stops capturing; a late frame resolution changes nothing. */
  readonly teardown: () => void;
}

/** React's own recoverable-error wording is an internal we don't surface. */
const HYDRATION_MISMATCH_MESSAGE =
  "The island's server and client renders disagreed. React recovered by " +
  "re-rendering it on the client; the usual cause is a non-deterministic " +
  "render — a Date.now(), Math.random(), or locale/timezone read.";

/**
 * Captures the island failures `target` dispatches (hydration errors, island
 * render errors, hydration mismatches) and its uncaught errors and rejections.
 */
export function createIslandErrorLog(
  target: EventTarget,
  options: IslandErrorLogOptions,
): IslandErrorLog {
  // Replaced (not mutated) on each change so React sees a new reference and
  // reconciles the resolved frames when they arrive.
  let errors: readonly CapturedError[] = [];
  let active = 0;
  let expanded = false;
  // Set by a genuine capture and consumed by the next change, so only that
  // change pulses the count circle.
  let pulse = false;
  // Set on teardown so a late `resolveFrames` can't report a change.
  let torndown = false;
  // Identity dedup so a render loop or a doubly-dispatched failure (e.g. the
  // hydration path and the window `error` handler both seeing it) counts once.
  const seenObjects = new WeakSet();
  const seenPrimitives = new Set<string>();
  const listeners: (() => void)[] = [];

  function changed(): void {
    if (torndown) return;
    options.onChange({ errors, active, expanded, pulse });
    pulse = false;
  }

  function on(type: string, handler: (event: Event) => void): void {
    target.addEventListener(type, handler);
    listeners.push(() => target.removeEventListener(type, handler));
  }

  function isDuplicate(error: unknown): boolean {
    if (error !== null && typeof error === "object") {
      if (seenObjects.has(error)) return true;
      seenObjects.add(error);
      return false;
    }
    const key = String(error);
    if (seenPrimitives.has(key)) return true;
    seenPrimitives.add(key);
    return false;
  }

  function addEntry(info: DevErrorInfo, element?: HTMLElement): CapturedError {
    const label = deriveLabel(element);
    const entry: CapturedError = { info, ...(label ? { label } : {}) };
    errors = [entry, ...errors];
    // An expanded panel follows the entry being read as it shifts down, so the
    // panel never swaps out from under the developer.
    active = expanded ? active + 1 : 0;
    pulse = true;
    changed();
    return entry;
  }

  // Browser stacks point at Vite's served module URLs, so the dev resolver maps
  // them back to the original `file:line` frames.
  async function resolveFrames(entry: CapturedError): Promise<void> {
    const { stack } = entry.info;
    if (!stack) return;
    let frames: readonly DevErrorFrame[] | undefined;
    try {
      frames = await options.resolveFrames(stack);
    } catch {
      // Keep the raw stack when the resolver is unreachable.
      return;
    }
    if (!frames || frames.length === 0) return;
    const index = errors.indexOf(entry);
    if (index < 0) return;
    const resolved: CapturedError = {
      ...entry,
      info: { ...entry.info, frames },
    };
    errors = errors.map((e, i) => (i === index ? resolved : e));
    changed();
  }

  function capture(
    error: unknown,
    element?: HTMLElement,
    componentStack?: string,
  ): void {
    if (isDuplicate(error)) return;
    const entry = addEntry(toDevErrorInfo(error, componentStack), element);
    void resolveFrames(entry);
  }

  // A hydration mismatch has no thrown error and no JS stack, so it skips frame
  // resolution; React's component stack is the signal.
  function captureMismatch(
    element?: HTMLElement,
    componentStack?: string,
    hydrationDiff?: DevErrorHydrationDiff,
  ): void {
    // Dedup by island + React stack (no error object to key on), so a
    // doubly-dispatched identical mismatch counts once.
    const key = `hydration-mismatch:${deriveLabel(element) ?? ""}:${componentStack ?? ""}`;
    if (seenPrimitives.has(key)) return;
    seenPrimitives.add(key);
    addEntry(
      {
        name: "Hydration mismatch",
        message: HYDRATION_MISMATCH_MESSAGE,
        ...(componentStack !== undefined ? { componentStack } : {}),
        ...(hydrationDiff !== undefined ? { hydrationDiff } : {}),
      },
      element,
    );
  }

  on("plumix:hydration-error", (event) => {
    // Cancel the framework's default (a console log): the overlay owns the
    // surfacing now.
    event.preventDefault();
    const { error, element } = detailOf(event);
    capture(error, element);
  });
  on("plumix:island-error", (event) => {
    const { error, element, componentStack } = detailOf(event);
    capture(error, element, componentStack);
  });
  on("plumix:island-hydration-mismatch", (event) => {
    // No thrown error, since React recovered, so this is a synthesized entry
    // rather than one built by `toDevErrorInfo`.
    const { element, componentStack, server, client } = detailOf(event);
    const diff =
      server !== undefined && client !== undefined
        ? { server, client }
        : undefined;
    captureMismatch(element, componentStack, diff);
  });
  on("error", (event) => {
    // Skip `error` events with no error object — a cross-origin
    // "Script error." or a resource-load 404 — nothing actionable to show.
    const { error } = event as { error?: unknown };
    if (error == null) return;
    capture(error);
  });
  on("unhandledrejection", (event) => {
    capture((event as { reason?: unknown }).reason);
  });

  return {
    expand() {
      expanded = true;
      changed();
    },
    collapse() {
      if (!expanded) return;
      expanded = false;
      changed();
    },
    step(delta) {
      active = (active + delta + errors.length) % errors.length;
      changed();
    },
    teardown: () => {
      torndown = true;
      for (const off of listeners) off();
      listeners.length = 0;
    },
  };
}

/**
 * Browser stacks arrive raw, so keep the stack string rather than parse frames
 * that would point at transformed positions.
 */
export function toDevErrorInfo(
  error: unknown,
  componentStack?: string,
): DevErrorInfo {
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
