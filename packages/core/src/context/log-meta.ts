import type { LogMeta } from "./app-context.js";

type LogValue = LogMeta[string];

/** An `Error` as plain fields: its own fields are non-enumerable, so a drain would show `{}`. */
export interface LoggedError {
  readonly name: string;
  readonly message: string;
  readonly stack: string | undefined;
  readonly cause: LogValue;
}

const CIRCULAR = "[Circular]";

/** The error with its cause chain, each cause that is an `Error` written the same way. */
export function loggableError(error: Error): LoggedError {
  return errorFields(error, new Set([error]));
}

/** The meta with every `Error` in it written as {@link loggableError} does. */
export function loggableMeta(meta: LogMeta): LogMeta {
  return objectFields(meta, new Set([meta]));
}

function errorFields(
  error: Error,
  ancestors: ReadonlySet<object>,
): LoggedError {
  const { name, message, stack, cause } = error;
  return { name, message, stack, cause: walk(cause, ancestors) };
}

function objectFields(meta: LogMeta, ancestors: ReadonlySet<object>): LogMeta {
  return Object.fromEntries(
    Object.entries(meta).map(([key, item]) => [key, walk(item, ancestors)]),
  );
}

function walk(value: LogValue, ancestors: ReadonlySet<object>): LogValue {
  if (!isWalkable(value)) return value;
  if (ancestors.has(value)) return CIRCULAR;
  const inner = new Set(ancestors).add(value);
  if (value instanceof Error) return errorFields(value, inner);
  if (Array.isArray(value)) return value.map((item) => walk(item, inner));
  return objectFields(value, inner);
}

function isWalkable(value: LogValue): value is Error | LogValue[] | LogMeta {
  if (value instanceof Error || Array.isArray(value)) return true;
  if (typeof value !== "object" || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
