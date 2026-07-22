// `node:async_hooks` is supported on Node, Bun, Deno (Node-compat), and
// Cloudflare Workers (with `nodejs_compat` — already required by Plumix).
// When TC39 AsyncContext ships, swap the import here; consumers stay unchanged.
import { AsyncLocalStorage } from "node:async_hooks";

import type { AppContext } from "./app.js";
import type { TelemetrySpan } from "./telemetry.js";
import { ContextError } from "./errors.js";

export const requestStore = new AsyncLocalStorage<AppContext>();

export interface HookFrame {
  readonly hook: string;
  readonly plugin: string | null;
}

export const hookStore = new AsyncLocalStorage<HookFrame>();

export const traceStore = new AsyncLocalStorage<TelemetrySpan>();

export const txStore = new AsyncLocalStorage<unknown>();

export function getContext(): AppContext {
  const ctx = requestStore.getStore();
  if (!ctx) throw ContextError.noRequestContext();
  return ctx;
}

export function tryGetContext(): AppContext | null {
  return requestStore.getStore() ?? null;
}
