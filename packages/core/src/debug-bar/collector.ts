import type { DebugCollector } from "../context/debug.js";
import type { TraceSpan } from "../context/stores.js";
import type { DebugBarInput } from "./config.js";
import { NOOP_DEBUG } from "../context/debug.js";
import { traceStore } from "../context/stores.js";
import { normalizeDebugBar } from "./config.js";

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    value != null && typeof (value as PromiseLike<unknown>).then === "function"
  );
}

/**
 * The real, dev-only debug collector. Accumulates per-namespace entries and a
 * span tree for the request. Created only under the dev gate; production uses
 * {@link NOOP_DEBUG} instead, so this module tree-shakes out of prod builds.
 */
export function createDebugCollector(
  debugBar: DebugBarInput | undefined,
): DebugCollector {
  const { enabled, disabled } = normalizeDebugBar(debugBar);
  // Globally disabled in dev: skip all collection overhead, not just render.
  if (!enabled) return NOOP_DEBUG;

  const entries = new Map<string, unknown[]>();
  const roots: TraceSpan[] = [];

  return {
    record(namespace, entry) {
      // A disabled panel stops collecting too (not just rendering): its
      // namespace is its panel id, so denylisted namespaces drop at the source.
      if (disabled.has(namespace)) return;
      const bucket = entries.get(namespace);
      if (bucket) bucket.push(entry);
      else entries.set(namespace, [entry]);
    },
    span(name, fn) {
      const startedAt = Date.now();
      const span: TraceSpan = {
        name,
        startedAt,
        durationMs: 0,
        children: [],
        annotations: {},
      };
      // Attach to the enclosing span (via AsyncLocalStorage) so nesting
      // reflects call structure; top-level spans become roots.
      const parent = traceStore.getStore();
      if (parent) parent.children.push(span);
      else roots.push(span);
      const stamp = (): void => {
        span.durationMs = Date.now() - startedAt;
      };
      let result: ReturnType<typeof fn>;
      try {
        result = traceStore.run(span, fn);
      } catch (error) {
        stamp();
        throw error;
      }
      // Await async work before stamping so I/O time is measured, not just the
      // synchronous prelude. Nesting already survives awaits via ALS.
      if (isThenable(result)) {
        return result.then(
          (value) => {
            stamp();
            return value;
          },
          (error) => {
            stamp();
            throw error;
          },
        ) as ReturnType<typeof fn>;
      }
      stamp();
      return result;
    },
    get(namespace) {
      return entries.get(namespace) ?? [];
    },
    getSpans(): readonly TraceSpan[] {
      return roots;
    },
  };
}
