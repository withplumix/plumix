import type { TraceSpan } from "./stores.js";

/**
 * Request-scoped debug collector. Core and plugins record per-request data
 * under a namespace (a panel id) and read it back when their panel renders.
 * Two implementations: {@link NOOP_DEBUG} (always present in core, prod-safe)
 * and the real accumulating collector in the dev-gated debug-bar module.
 */
export interface DebugCollector {
  /** Append an entry under `namespace` (the recording panel's id). */
  record(namespace: string, entry: unknown): void;
  /** Time `fn`, record a span, and return `fn`'s result unchanged. */
  span<T>(name: string, fn: () => T): T;
  /** Entries recorded under `namespace`, in record order. */
  get(namespace: string): readonly unknown[];
  /** The collected span tree (the Timeline panel consumes this). */
  getSpans(): readonly TraceSpan[];
}

/**
 * The permanent no-op collector. Lives in core proper so plugin `ctx.debug`
 * call sites stay safe in production: `record` drops the entry, `span` calls
 * through and returns the result, reads are empty. The real collector is
 * swapped in only under the dev gate.
 */
export const NOOP_DEBUG: DebugCollector = {
  record: () => undefined,
  span: (_name, fn) => fn(),
  get: () => [],
  getSpans: () => [],
};
