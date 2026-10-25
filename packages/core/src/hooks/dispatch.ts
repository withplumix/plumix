import type { AppContext } from "../context/app-context.js";
import type { AppEvents, AppFilters } from "./define.js";
import type { HookRegistry } from "./registry.js";

interface Dispatch {
  readonly events: AppEvents;
  readonly filters: AppFilters;
}

const bound = new WeakMap<AppEvents, HookRegistry>();

/** `ctx.events` and `ctx.filters`, handing their handlers the context `ctx`. */
export function bindDispatch(
  hooks: HookRegistry,
  ctx: () => AppContext,
): Dispatch {
  const events: AppEvents = {
    emit: (event, payload) => hooks.emit(event, payload, ctx()),
  };
  bound.set(events, hooks);
  return {
    events,
    filters: {
      apply: (filter, value, ...input) =>
        hooks.apply(filter, value, input[0], ctx()),
    },
  };
}

/**
 * Every context derived by spreading another rebinds, or its handlers would
 * receive the request or principal it was derived from.
 */
export function rebindDispatch<TSchema extends Record<string, unknown>>(
  from: AppContext<TSchema>,
  ctx: () => AppContext<TSchema>,
): Dispatch {
  const hooks = bound.get(from.events);
  if (hooks === undefined) {
    return { events: from.events, filters: from.filters };
  }
  return bindDispatch(hooks, () => coreSchemaView(ctx()));
}

function coreSchemaView<TSchema extends Record<string, unknown>>(
  ctx: AppContext<TSchema>,
): AppContext {
  // Safety: a handler is typed against core's schema, which every site's
  // schema carries beside its own.
  return ctx as unknown as AppContext;
}
