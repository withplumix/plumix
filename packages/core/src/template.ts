import type { ComponentType, ReactNode } from "react";
import { createElement } from "react";

import type { AppContext } from "./context/app-context.js";
import type { DocumentManifest } from "./document-manifest.js";
import type { ViewTransitionsInput } from "./theme-view-transitions.js";
import type { TemplateData } from "./theme.js";
import { ThemeRegistrationError } from "./theme-errors.js";

// Not `Symbol.for(...)`: the global registry would let any caller forge a
// template.
const PLUMIX_TEMPLATE_BRAND: unique symbol = Symbol("plumix.template");

/**
 * Augmented per kind as `{ slug | location: string; result }`. The loader
 * receives keys under that name, so reading the wrong one does not compile.
 *
 * ```ts
 * declare module "plumix" {
 *   interface TemplateDepRegistry {
 *     menus: { location: string; result: ResolvedMenu };
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intentional augmentation seam
export interface TemplateDepRegistry {}

type TemplateDepKeyField = "slug" | "location";

/** The key field kind `K`'s registry entry declares. */
export type TemplateDepKeyedBy<K extends keyof TemplateDepRegistry> =
  keyof TemplateDepRegistry[K] & TemplateDepKeyField;

export type TemplateDepKey<K extends keyof TemplateDepRegistry> =
  TemplateDepRegistry[K][TemplateDepKeyedBy<K>];

/**
 * An array replaces the inherited keys, `(prev) => next` composes them, `[]`
 * disables the dep, and an omitted kind inherits unchanged.
 */
export type TemplateDepDeclarations = {
  readonly [K in keyof TemplateDepRegistry]?:
    | readonly TemplateDepKey<K>[]
    | ((prev: readonly TemplateDepKey<K>[]) => readonly TemplateDepKey<K>[]);
};

// `null` when the loader returned nothing for that key, or threw.
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

// The function form runs per request after the block loaders, so it can await
// the same `ctx.memo` lookup. It may throw `pageNotFound()` or `redirectTo()`.
type TemplateDocument<TData extends TemplateData> =
  | DocumentManifest
  | ((
      args: TemplateRenderArgs<TData>,
    ) => DocumentManifest | Promise<DocumentManifest>);

/**
 * The brand is non-enumerable, so it stays out of `Object.keys` and JSON.
 * Dep declarations live directly on the object as `template[kind]`.
 */
export interface Template<
  TData extends TemplateData = TemplateData,
> extends TemplateDepDeclarations {
  readonly render: TemplateRender<TData>;
  readonly document?: TemplateDocument<TData>;
  /**
   * Assumes `node.id` is unique across all entries' block trees; otherwise
   * sibling loader data silently collides.
   */
  readonly prefetchArchiveLoaders?: boolean;
  /**
   * Replaces the theme's `viewTransitions` whole for the pages this
   * template renders (ADR 0031); omitted, the theme's value applies.
   */
  readonly viewTransitions?: ViewTransitionsInput;
  readonly [PLUMIX_TEMPLATE_BRAND]: true;
}

interface DefineTemplateConfig<
  TData extends TemplateData,
> extends TemplateDepDeclarations {
  readonly render: TemplateRender<TData>;
  readonly document?: TemplateDocument<TData>;
  readonly prefetchArchiveLoaders?: boolean;
  readonly viewTransitions?: ViewTransitionsInput;
}

export function defineTemplate<TData extends TemplateData = TemplateData>(
  config: DefineTemplateConfig<TData>,
): Template<TData> {
  // Dep kinds live as top-level keys the per-request dispatch reads, so every
  // config key is copied.
  const template: Template<TData> = {
    ...config,
    [PLUMIX_TEMPLATE_BRAND]: true,
  };
  // Non-enumerable so a spread doesn't carry the brand onward. The symbol is
  // module-local, so no caller can forge or rewrite it.
  Object.defineProperty(template, PLUMIX_TEMPLATE_BRAND, {
    value: true,
    enumerable: false,
  });
  return template;
}

export function isTemplate(value: unknown): value is Template {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[PLUMIX_TEMPLATE_BRAND] === true
  );
}

/**
 * Hand-written `{ render }` literals throw, so a future field doesn't go
 * silently ignored on a malformed registration.
 */
export function normalizeTemplate(value: unknown, slot: string): Template {
  if (isTemplate(value)) return value;
  if (typeof value === "function") {
    // Through `createElement` so hooks work; calling it directly throws
    // "Invalid hook call".
    const ComponentLike = value as ComponentType<{
      readonly data: TemplateData;
    }>;
    return defineTemplate({
      render: ({ data }) => createElement(ComponentLike, { data }),
    });
  }
  throw ThemeRegistrationError.invalidTemplate({ slot });
}
