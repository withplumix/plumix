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
 * Augmentable registry of template-level dep slots. Slice #518 wires
 * `registerTemplateDep` against this interface; today it stays empty
 * so subsequent module augmentations don't require an ABI bump.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intentional augmentation seam
export interface TemplateDepRegistry {}

export interface TemplateRenderArgs<TData extends TemplateData> {
  readonly data: TData;
  readonly ctx: AppContext;
}

export type TemplateRender<TData extends TemplateData> = (
  args: TemplateRenderArgs<TData>,
) => ReactNode;

/**
 * Output of `defineTemplate`. The brand symbol is non-enumerable so
 * it doesn't pollute `Object.keys` / JSON serialization but stays
 * load-bearing for runtime identification via `isTemplate`.
 *
 * `document` is the optional per-template fragment merged with the
 * theme's site-wide document at boot. Per-request renders look up the
 * already-merged result keyed by the matched template slot — zero
 * runtime merge cost.
 */
export interface Template<TData extends TemplateData = TemplateData> {
  readonly render: TemplateRender<TData>;
  readonly document?: DocumentManifest;
  readonly [PLUMIX_TEMPLATE_BRAND]: true;
}

interface DefineTemplateConfig<TData extends TemplateData> {
  readonly render: TemplateRender<TData>;
  readonly document?: DocumentManifest;
}

export function defineTemplate<TData extends TemplateData = TemplateData>(
  config: DefineTemplateConfig<TData>,
): Template<TData> {
  const template: {
    render: TemplateRender<TData>;
    document?: DocumentManifest;
  } = {
    render: config.render,
  };
  if (config.document !== undefined) template.document = config.document;
  // `enumerable: false` keeps the brand out of `Object.keys` / JSON;
  // writable/configurable defaults are fine — the symbol itself is
  // module-local so no caller can forge or rewrite it.
  Object.defineProperty(template, PLUMIX_TEMPLATE_BRAND, {
    value: true,
    enumerable: false,
  });
  return template as Template<TData>;
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
