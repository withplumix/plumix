// `node:async_hooks` is supported on Node, Bun, Deno (Node-compat), and
// Cloudflare Workers (with `nodejs_compat` — already required by Plumix).
// When TC39 AsyncContext ships, swap the import here; consumers stay unchanged.
import { AsyncLocalStorage } from "node:async_hooks";

import type { AppContext } from "./app.js";
import { ContextError } from "./errors.js";

export const requestStore = new AsyncLocalStorage<AppContext>();

export interface HookFrame {
  readonly hook: string;
  readonly plugin: string | null;
}

export const hookStore = new AsyncLocalStorage<HookFrame>();

export interface TraceSpan {
  readonly name: string;
  readonly startedAt: number;
  /** Wall-clock duration; set when the span's work completes. */
  durationMs: number;
  readonly children: TraceSpan[];
  readonly annotations: Record<string, unknown>;
}

export const traceStore = new AsyncLocalStorage<TraceSpan>();

export const txStore = new AsyncLocalStorage<unknown>();

export function getContext(): AppContext {
  const ctx = requestStore.getStore();
  if (!ctx) throw ContextError.noRequestContext();
  return ctx;
}

export function tryGetContext(): AppContext | null {
  return requestStore.getStore() ?? null;
}
