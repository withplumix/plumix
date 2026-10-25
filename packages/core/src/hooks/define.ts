import type { AppContext } from "../context/app-context.js";

declare const payloadType: unique symbol;
declare const valueType: unique symbol;
declare const inputType: unique symbol;

/** What `defineEvent` returns: an id carrying its payload type. */
export interface EventDefinition<TPayload> {
  readonly kind: "event";
  readonly id: string;
  readonly [payloadType]?: (payload: TPayload) => TPayload;
}

/** What `defineFilter` returns: an id carrying its value, input and sync flag. */
export interface FilterDefinition<TValue, TInput, TSync extends boolean> {
  readonly kind: "filter";
  readonly id: string;
  readonly sync: TSync;
  readonly [valueType]?: (value: TValue) => TValue;
  readonly [inputType]?: (input: TInput) => TInput;
}

/** Any event, whatever its payload: what a descriptor lists. */
export type AnyEventDefinition = Pick<EventDefinition<unknown>, "kind" | "id">;
/** Any filter, whatever its types: what a descriptor lists. */
export type AnyFilterDefinition = Pick<
  FilterDefinition<unknown, unknown, boolean>,
  "kind" | "id" | "sync"
>;

/** Bands first, then core, then plugin config order, then registration order. */
export type HandlerOrder = "early" | "late";

export interface HandlerOptions {
  readonly order?: HandlerOrder;
}

export type EventHandler<TPayload> = (
  payload: TPayload,
  ctx: AppContext,
) => void | Promise<void>;

export type FilterHandler<TValue, TInput, TSync extends boolean> = (
  value: TValue,
  input: Readonly<TInput>,
  ctx: AppContext,
) => TSync extends true ? TValue : TValue | Promise<TValue>;

/** One event handler that threw or rejected; `plugin` is `null` for core. */
export interface EventFailure {
  readonly plugin: string | null;
  readonly error: unknown;
}

/** `ctx.events` in `setup` and `afterSetup`. */
export interface SetupEvents {
  on<TPayload>(
    event: EventDefinition<TPayload>,
    handler: EventHandler<TPayload>,
    options?: HandlerOptions,
  ): void;
}

/** `ctx.filters` in `setup` and `afterSetup`. */
export interface SetupFilters {
  add<TValue, TInput, TSync extends boolean>(
    filter: FilterDefinition<TValue, TInput, TSync>,
    handler: FilterHandler<TValue, TInput, TSync>,
    options?: HandlerOptions,
  ): void;
}

/** `ctx.events` on a request or a job. */
export interface AppEvents {
  /**
   * Starts every handler in order and waits for all of them. A failure stops
   * no other handler and is logged; the report lists each one.
   */
  emit<TPayload>(
    event: EventDefinition<TPayload>,
    payload: TPayload,
  ): Promise<readonly EventFailure[]>;
}

type FilterInputArgs<TInput> = undefined extends TInput
  ? [input?: TInput]
  : [input: TInput];

/** `ctx.filters` on a request or a job. */
export interface AppFilters {
  /** A handler's throw reaches the caller unchanged. */
  apply<TValue, TInput, TSync extends boolean>(
    filter: FilterDefinition<TValue, TInput, TSync>,
    value: TValue,
    ...input: FilterInputArgs<TInput>
  ): TSync extends true ? TValue : Promise<TValue>;
}

/** The id is `<owner>:<name>`; list the event in the declaring descriptor's `events`. */
export function defineEvent<TPayload>(id: string): EventDefinition<TPayload> {
  return { kind: "event", id };
}

/**
 * The id is `<owner>:<name>`; list the filter in the declaring descriptor's
 * `filters`. A `sync` filter's handlers can't return a promise, and its value
 * is not copied between them.
 */
export function defineFilter<TValue, TInput = undefined>(
  id: string,
  options: { readonly sync: true },
): FilterDefinition<TValue, TInput, true>;
export function defineFilter<TValue, TInput = undefined>(
  id: string,
  options?: { readonly sync: false },
): FilterDefinition<TValue, TInput, false>;
export function defineFilter(
  id: string,
  options?: { readonly sync: boolean },
): FilterDefinition<unknown, unknown, boolean> {
  return { kind: "filter", id, sync: options?.sync ?? false };
}
