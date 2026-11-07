import type { AppContext } from "../context/app-context.js";
import type { AppEvents, AppFilters } from "./define.js";
import type { HandlerRegistry } from "./registry.js";

interface Dispatch {
  readonly events: AppEvents;
  readonly filters: AppFilters;
}

const bound = new WeakMap<AppEvents, HandlerRegistry>();

/** `ctx.events` and `ctx.filters`, handing their handlers the context `ctx`. */
export function bindDispatch(
  handlers: HandlerRegistry,
  ctx: () => AppContext,
): Dispatch {
  const events: AppEvents = {
    emit: (event, payload) => handlers.emit(event, payload, ctx()),
  };
  bound.set(events, handlers);
  return {
    events,
    filters: {
      apply: (filter, value, ...input) =>
        handlers.apply(filter, value, input[0], ctx()),
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
  const handlers = bound.get(from.events);
  if (handlers === undefined) {
    return { events: from.events, filters: from.filters };
  }
  return bindDispatch(handlers, () => coreSchemaView(ctx()));
}

function coreSchemaView<TSchema extends Record<string, unknown>>(
  ctx: AppContext<TSchema>,
): AppContext {
  // Safety: a handler is typed against core's schema, which every site's
  // schema carries beside its own.
  return ctx as unknown as AppContext;
}
