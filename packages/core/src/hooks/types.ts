// Plugin authors and core hooks both extend these registries via TypeScript
// module augmentation. The Vite plugin emits typed declarations from
// `registerEntryType` / `registerTaxonomy` / `registerFilter` / `registerAction`
// calls so cross-plugin autocompletion works without manual type wiring.
//
// Each registry value is the handler signature for that hook name.

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface FilterRegistry {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ActionRegistry {}

// `keyof` of an empty interface is `never`; after module augmentation by the
// Vite plugin (and by tests), it becomes a string-literal union.
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
export type FilterName = keyof FilterRegistry & string;
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
export type ActionName = keyof ActionRegistry & string;

// Filters are pipelines: each handler receives the previous handler's return
// value as its first argument and returns the (possibly transformed) value.
// `(value, ...rest) => value | Promise<value>`.
export type FilterFn<TName extends FilterName> = FilterRegistry[TName] extends (
  ...args: infer A
) => infer R
  ? (...args: A) => R
  : never;

// Filter input type = first parameter type. Rest params = everything else.
// Extracted via Parameters<T> + tuple slicing so `applyFilter(name, input, ...rest)`
// is type-safe at the call site.
export type FilterInput<TName extends FilterName> = Parameters<
  FilterRegistry[TName]
>[0];

export type FilterRest<TName extends FilterName> =
  Parameters<FilterRegistry[TName]> extends [unknown, ...infer R] ? R : [];

export type ActionFn<TName extends ActionName> = ActionRegistry[TName] extends (
  ...args: infer A
) => unknown
  ? (...args: A) => void | Promise<void>
  : never;

export type ActionArgs<TName extends ActionName> =
  ActionRegistry[TName] extends (...args: infer A) => unknown ? A : never;

export interface HookOptions {
  /** Lower runs first. Default: 100. Stable tie-break by registration order. */
  readonly priority?: number;
}

export const DEFAULT_HOOK_PRIORITY = 100;
