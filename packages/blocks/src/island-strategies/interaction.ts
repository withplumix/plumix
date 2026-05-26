// `interaction` strategy — the headline trigger. Hydration is deferred
// until the user actually engages with the island, then the triggering
// event is *replayed* onto the hydrated component so the first
// click/keypress isn't lost. Paired with `prefetch: "visible"` (the
// default), the chunk is already warm when the user clicks, so hydrate →
// replay feels instant.
//
// This is where Astro and Nuxt fall short and we improve:
//   - Astro replays nothing — the first interaction during the SSR-only
//     window is silently dropped (inherent to its hydrate-from-scratch
//     model).
//   - Nuxt replays, but only the *first* event and via a synthetic
//     re-dispatch; a click that arrives while the chunk is still loading
//     (e.g. after a `pointerenter` trigger) is lost (vuejs/core), and its
//     reconstruction loses keyboard state.
//
// The mechanism mirrors TanStack Start's `interaction.ts`: a single
// document-level *capture-phase* listener (registered once), walk to the
// nearest island marker, `preventDefault` + stop propagation so the dead
// DOM does nothing, encode a positional path to the real target, and after
// hydration `requestAnimationFrame` → re-dispatch. We diverge from TanStack
// on three correctness points it gets wrong:
//   1. Reconstruct with `event.constructor`, not a hardcoded
//      MouseEvent/FocusEvent ladder — so `KeyboardEvent` (key/code/
//      modifiers) survives the replay. TanStack drops it.
//   2. After replaying a focus event, call `.focus()` on the target —
//      re-dispatching a `FocusEvent` does not move `document.activeElement`,
//      so the native side-effect `preventDefault` suppressed is restored.
//   3. Queue *every* matching event between the trigger and hydration, not
//      just the first, and replay them in order — so the hover→click race
//      that loses Nuxt's click is handled.

import type { IslandStrategy, PlumixIslandElement } from "../island-element.js";

// The superset the single document listener subscribes to. An island's
// `opts.events` (if any) must be a subset; `pointerenter` is a trigger only
// — it doesn't bubble, so it's never replayed (only its bubbling cousins
// are), matching browser event semantics.
const SUPPORTED_EVENTS = [
  "pointerenter",
  "focusin",
  "pointerdown",
  "click",
  "keydown",
] as const;

interface QueuedEvent {
  readonly type: string;
  readonly path: readonly number[];
  readonly event: Event;
}

interface Registration {
  readonly loadFn: () => Promise<void>;
  readonly events: ReadonlySet<string>;
  triggered: boolean;
  readonly queue: QueuedEvent[];
}

const registry = new Map<PlumixIslandElement, Registration>();
let listening = false;

export const interactionStrategy: IslandStrategy = (loadFn, opts, el) => {
  registry.set(el, {
    loadFn,
    events: readEvents(opts),
    triggered: false,
    queue: [],
  });
  ensureListeners();
  return () => registry.delete(el);
};

function readEvents(
  opts: Readonly<Record<string, unknown>>,
): ReadonlySet<string> {
  const raw = opts.events;
  const list = Array.isArray(raw)
    ? raw.filter((e): e is string => typeof e === "string")
    : null;
  return new Set(list && list.length > 0 ? list : SUPPORTED_EVENTS);
}

function ensureListeners(): void {
  if (listening || typeof document === "undefined") return;
  listening = true;
  for (const type of SUPPORTED_EVENTS) {
    document.addEventListener(type, onIntent, true);
  }
}

function onIntent(event: Event): void {
  if (registry.size === 0) return;
  const target = eventTarget(event);
  if (!target) return;
  const marker = nearestMarker(target, event.type);
  if (!marker) return;
  const reg = registry.get(marker);
  if (!reg) return;

  // Kill the event on the dead DOM — nothing is wired up yet. Capture phase
  // + stopImmediatePropagation means no other listener sees it either, so
  // we have full control over the replay.
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  // Only bubbling events can be faithfully replayed; `pointerenter` /
  // `focus` don't bubble, so they trigger hydration but aren't queued.
  if (event.bubbles) {
    reg.queue.push({
      type: event.type,
      path: encodePath(marker, target),
      // Reconstruct now, synchronously: the live event is recycled by the
      // browser once this handler returns, but its init values are still
      // readable here.
      event: reconstruct(event),
    });
  }

  if (reg.triggered) return;
  reg.triggered = true;
  void reg.loadFn().then(() => replay(marker, reg));
}

// Nearest registered, not-yet-hydrated island that is `target` or an
// ancestor of it and listens for this event type.
function nearestMarker(
  target: Element,
  type: string,
): PlumixIslandElement | null {
  let el: Element | null = target.closest(ISLAND_SELECTOR);
  while (el) {
    const reg = registry.get(el as PlumixIslandElement);
    if (reg?.events.has(type)) return el as PlumixIslandElement;
    el = el.parentElement?.closest(ISLAND_SELECTOR) ?? null;
  }
  return null;
}

function replay(marker: PlumixIslandElement, reg: Registration): void {
  // React is mounted and listening now; stop intercepting so further events
  // reach it natively, then re-dispatch what we captured.
  registry.delete(marker);
  if (reg.queue.length === 0) return;
  requestAnimationFrame(() => {
    for (const queued of reg.queue) {
      const node = resolvePath(marker, queued.path);
      // A focus event can't be faithfully replayed by dispatch: re-
      // dispatching a `FocusEvent` doesn't move `document.activeElement`,
      // and doing both `.focus()` AND `dispatchEvent` would fire the
      // component's focus handler twice. `.focus()` alone produces the
      // genuine native focus → focusin sequence the component expects.
      if (
        (queued.type === "focusin" || queued.type === "focus") &&
        node instanceof HTMLElement
      ) {
        node.focus();
      } else {
        node.dispatchEvent(queued.event);
      }
    }
  });
}

// Positional path from the marker down to the target: child-index at each
// level, top-down.
function encodePath(marker: Element, target: Element): readonly number[] {
  const path: number[] = [];
  let node: Element = target;
  while (node !== marker) {
    const parent = node.parentElement;
    if (!parent) return [];
    path.push(Array.prototype.indexOf.call(parent.children, node));
    node = parent;
  }
  path.reverse();
  return path;
}

function resolvePath(marker: Element, path: readonly number[]): Element {
  let node: Element = marker;
  for (const index of path) {
    const next = node.children[index];
    if (!next) return node;
    node = next;
  }
  return node;
}

// Re-construct via the original event's own constructor so subtype data
// (MouseEvent coordinates, KeyboardEvent key/code/modifiers, PointerEvent
// pressure) is preserved — the event itself is a valid init dict for its
// own constructor. Falls back to a plain bubbling Event if the subtype
// isn't constructible in this environment.
type EventConstructor = new (type: string, init: Event) => Event;

function reconstruct(event: Event): Event {
  const Ctor = event.constructor as EventConstructor;
  try {
    return new Ctor(event.type, event);
  } catch {
    return new Event(event.type, { bubbles: true, cancelable: true });
  }
}

function eventTarget(event: Event): Element | null {
  const target = event.target;
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

const ISLAND_SELECTOR = "plumix-island";

export function registerInteractionStrategy(): void {
  const target = self as unknown as {
    Plumix?: Record<string, IslandStrategy>;
  };
  target.Plumix = {
    ...(target.Plumix ?? {}),
    interaction: interactionStrategy,
  };
}
