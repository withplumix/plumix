// Every event between trigger and hydration is queued and replayed in order,
// so a click that lands while the chunk loads after a hover isn't lost.

import type { JsonObject } from "../../json.js";
import type { IslandStrategy, PlumixIslandElement } from "../island-element.js";
import { isJsonArray } from "../../json.js";
import { publishIslandStrategy } from "../island-global.js";

/**
 * `pointerenter` doesn't bubble, so it can trigger hydration but is never
 * replayed.
 */
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

function readEvents(opts: JsonObject): ReadonlySet<string> {
  const raw = opts.events;
  // `isJsonArray`, not `Array.isArray`: the latter widens a `JsonValue` to
  // `any[]` and leaves the readonly array on the object side of the union.
  const list =
    raw !== undefined && isJsonArray(raw)
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

/**
 * Nearest registered, not-yet-hydrated island that is `target` or an
 * ancestor of it and listens for this event type.
 */
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
      // A dispatched `FocusEvent` doesn't move `activeElement`, and dispatching
      // too would fire the handler twice.
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

/**
 * Positional path from the marker down to the target: child-index at each
 * level, top-down.
 */
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

/**
 * The event is a valid init dict for its own constructor, which keeps subtype
 * data like keyboard modifiers.
 */
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
  publishIslandStrategy("interaction", interactionStrategy);
}
