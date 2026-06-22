import type { ComponentType, ReactNode } from "react";
import { createElement } from "react";

import type { AppContext } from "./context/app.js";
import type { DocumentManifest, TemplateData } from "./theme.js";
import { ThemeRegistrationError } from "./theme-errors.js";

// Module-local brand — not `Symbol.for(...)`. The global registry
// would let any caller forge a fake template via
// `Symbol.for("plumix.template")`, defeating the whole point of the
// brand. A module-local symbol is only obtainable through this
// file's exports (`defineTemplate`, `isTemplate`).
const PLUMIX_TEMPLATE_BRAND: unique symbol = Symbol("plumix.template");

/**
 * Augmentable registry of template-level dep slots. Plugins register
 * loaders via `ctx.registerTemplateDep(kind, { load })` and themes
 * declare what they need via `defineTemplate({ [kind]: slugs[], ... })`.
 * The framework loads each declared dep in parallel per request and
 * passes results into render.
 *
 * Each entry shape: `{ slug: string; result: ResultType }`. Augment via
 * declaration merging — see `core` registering `settings` for the
 * canonical example.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intentional augmentation seam
export interface TemplateDepRegistry {}

/**
 * Per-kind declarations on a theme or template. An array replaces the
 * inherited value (override); a function `(prev) => next` receives the
 * theme's slugs and returns the composed set (extend / filter); an
 * empty array disables the dep for that template; an omitted kind
 * inherits unchanged.
 */
export type TemplateDepDeclarations = {
  readonly [K in keyof TemplateDepRegistry]?:
    | readonly TemplateDepRegistry[K]["slug"][]
    | ((
        prev: readonly TemplateDepRegistry[K]["slug"][],
      ) => readonly TemplateDepRegistry[K]["slug"][]);
};

/**
 * Per-kind results threaded into the render function. Keyed by slug,
 * `null` when the loader didn't return a value for that slug (or
 * threw — see `template_dep_load_failed` log).
 */
type TemplateDepResults = {
  readonly [K in keyof TemplateDepRegistry]?: Readonly<
    Record<string, TemplateDepRegistry[K]["result"] | null>
  >;
};

export interface TemplateRenderArgs<
  TData extends TemplateData,
> extends TemplateDepResults {
  readonly data: TData;
  readonly ctx: AppContext;
}

export type TemplateRender<TData extends TemplateData> = (
  args: TemplateRenderArgs<TData>,
) => ReactNode;

/**
 * Literal manifest is merged at boot; function form is called per
 * request with the same args `render` sees.
 */
type TemplateDocument<TData extends TemplateData> =
  | DocumentManifest
  | ((args: TemplateRenderArgs<TData>) => DocumentManifest);

/**
 * Output of `defineTemplate`. The brand symbol is non-enumerable so
 * it doesn't pollute `Object.keys` / JSON serialization but stays
 * load-bearing for runtime identification via `isTemplate`.
 *
 * Dep declarations (`[K in keyof TemplateDepRegistry]?`) live directly
 * on the template object so the framework's per-request dispatch can
 * read them via `template[kind]` and fire the registered loaders.
 */
export interface Template<
  TData extends TemplateData = TemplateData,
> extends TemplateDepDeclarations {
  readonly render: TemplateRender<TData>;
  readonly document?: TemplateDocument<TData>;
  /**
   * Cost is `O(entries × loaders/entry)`. Assumes `node.id` is unique
   * across all entries' block trees — editor content satisfies this;
   * bulk imports must ensure unique ids or sibling loader data
   * silently collides in the per-id result map.
   */
  readonly prefetchListingLoaders?: boolean;
  readonly [PLUMIX_TEMPLATE_BRAND]: true;
}

interface DefineTemplateConfig<
  TData extends TemplateData,
> extends TemplateDepDeclarations {
  readonly render: TemplateRender<TData>;
  readonly document?: TemplateDocument<TData>;
  readonly prefetchListingLoaders?: boolean;
}

export function defineTemplate<TData extends TemplateData = TemplateData>(
  config: DefineTemplateConfig<TData>,
): Template<TData> {
  // Copy every config key onto the template object. That preserves
  // any declared dep kinds (`settings`, `menus`, ...) which live as
  // top-level slug arrays — the framework's per-request dispatch
  // reads `template[kind]` to know which loaders to fire. `render` +
  // `document` come along the same way.
  const template: Record<string | symbol, unknown> = { ...config };
  // `enumerable: false` keeps the brand out of `Object.keys` / JSON;
  // writable/configurable defaults are fine — the symbol itself is
  // module-local so no caller can forge or rewrite it.
  Object.defineProperty(template, PLUMIX_TEMPLATE_BRAND, {
    value: true,
    enumerable: false,
  });
  return template as unknown as Template<TData>;
}

export function isTemplate(value: unknown): value is Template<TemplateData> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[PLUMIX_TEMPLATE_BRAND] === true
  );
}

/**
 * Boot-time normalizer. Plain function templates (the existing
 * `TemplateComponent` form) get wrapped into a branded `Template`;
 * factory-built templates pass through verbatim. Hand-written
 * `{ render: fn }` literals — close to but not from the factory —
 * fail loud so a future deps / document-fragment field doesn't get
 * silently ignored on a malformed registration.
 */
export function normalizeTemplate(
  value: unknown,
  slot: string,
): Template<TemplateData> {
  if (isTemplate(value)) return value;
  if (typeof value === "function") {
    // Invoke the legacy template via `createElement` so it runs inside
    // React's render pass — preserves hooks (useState, useId, etc.)
    // and supports both function and class components. Calling the
    // function directly would throw "Invalid hook call" the moment a
    // theme author reaches for a hook.
    const ComponentLike = value as ComponentType<{
      readonly data: TemplateData;
    }>;
    return defineTemplate({
      render: ({ data }) => createElement(ComponentLike, { data }),
    });
  }
  throw ThemeRegistrationError.invalidTemplate({ slot });
}
