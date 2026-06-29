import type { ComponentType, JSX } from "react";

import type {
  ShortcodeSpec,
  ThemeBreakpoints,
  ThemeTokens,
} from "@plumix/blocks";

import type {
  ArchiveData,
  ErrorData,
  FrontPageData,
  SearchData,
  SingleData,
  TaxonomyData,
} from "./route/render/resolved-entry.js";
import type { Template, TemplateDepDeclarations } from "./template.js";
import { RESERVED_DEP_KIND_NAMES } from "./template-deps.js";
import { ThemeError, ThemeRegistrationError } from "./theme-errors.js";

// `theme:document` is a boot-time filter chain. `buildApp` fires it once,
// after plugins install, threading the theme's own `document` manifest
// (or `{}` if absent) through every registered filter. The merged result
// is frozen on `PlumixApp.document` so per-request renders pay zero merge
// cost.
declare module "./hooks/types.js" {
  interface FilterRegistry {
    "theme:document": (
      manifest: DocumentManifest,
    ) => DocumentManifest | Promise<DocumentManifest>;
  }
}

/**
 * Discriminated union of every data shape a template can receive. Per-kind
 * templates (`single`, `archive`, …) narrow via the registry; `index`
 * receives the union and discriminates at runtime (e.g. `"entry" in data`).
 */
export type TemplateData =
  | SingleData
  | ArchiveData
  | TaxonomyData
  | FrontPageData
  | SearchData
  | ErrorData;

export type TemplateComponent<Data> = ComponentType<{ readonly data: Data }>;

// Per-slot entry type: either the legacy plain-function form
// (`TemplateComponent<T>`) or a `Template<T>` built via `defineTemplate`.
// The `normalizeTemplate` boot-time helper accepts both and rejects
// hand-written `{ render }` literals that didn't go through the factory.
export type TemplateEntry<Data extends TemplateData> =
  TemplateComponent<Data> | Template<Data>;

// Catch-all for the registry's index signature. The narrow per-key
// slots can't share a single typed slot due to contravariance, so the
// signature accepts any concrete-shape entry (`single-{type}`,
// `archive-{type}`, …) or one written against the full union.
type DynamicTemplateEntry =
  | TemplateEntry<SingleData>
  | TemplateEntry<ArchiveData>
  | TemplateEntry<TaxonomyData>
  | TemplateEntry<FrontPageData>
  | TemplateEntry<SearchData>
  | TemplateEntry<ErrorData>
  | TemplateEntry<TemplateData>;

/**
 * Strip React-isms that don't belong in HTML attribute descriptors:
 * `key`/`ref` are React infrastructure; `on*` handlers don't apply
 * to SSR'd strings; `children` and `dangerouslySetInnerHTML` are kept
 * only for `<script>` (inline content).
 */
type DocumentTag<T extends keyof JSX.IntrinsicElements> = Omit<
  JSX.IntrinsicElements[T],
  "key" | "ref" | `on${string}`
>;

export type DocumentLink = Omit<
  DocumentTag<"link">,
  "children" | "dangerouslySetInnerHTML"
>;

export type DocumentMeta = Omit<
  DocumentTag<"meta">,
  "children" | "dangerouslySetInnerHTML"
>;

// `children` and `dangerouslySetInnerHTML` are narrowed to plain strings:
// SSR'd inline script bodies, not React nodes or browser-native trusted-type
// values. JSX would otherwise allow `ReactNode`/`TrustedHTML` here, which
// can't be safely stringified into HTML.
export type DocumentScript = Omit<
  DocumentTag<"script">,
  "children" | "dangerouslySetInnerHTML"
> & {
  readonly position?: "headStart" | "headEnd" | "bodyStart" | "bodyEnd";
  readonly children?: string;
  readonly dangerouslySetInnerHTML?: { readonly __html: string };
};

export interface DocumentManifest {
  readonly html?: Omit<
    DocumentTag<"html">,
    "children" | "dangerouslySetInnerHTML"
  >;
  readonly body?: Omit<
    DocumentTag<"body">,
    "children" | "dangerouslySetInnerHTML"
  >;
  readonly link?: readonly DocumentLink[];
  readonly meta?: readonly DocumentMeta[];
  readonly script?: readonly DocumentScript[];
  readonly title?: string;
  readonly titleTemplate?: string | ((title: string | undefined) => string);
}

export interface TemplateRegistry {
  readonly index: TemplateEntry<TemplateData>;
  readonly single?: TemplateEntry<SingleData>;
  readonly singular?: TemplateEntry<SingleData>;
  readonly page?: TemplateEntry<SingleData>;
  readonly archive?: TemplateEntry<ArchiveData>;
  readonly taxonomy?: TemplateEntry<TaxonomyData>;
  readonly category?: TemplateEntry<TaxonomyData>;
  readonly tag?: TemplateEntry<TaxonomyData>;
  readonly "front-page"?: TemplateEntry<FrontPageData>;
  readonly home?: TemplateEntry<FrontPageData>;
  readonly search?: TemplateEntry<SearchData>;
  readonly "404"?: TemplateEntry<ErrorData>;
  readonly "500"?: TemplateEntry<ErrorData>;
  readonly [key: string]: DynamicTemplateEntry | undefined;
}

export interface ThemeDescriptor extends TemplateDepDeclarations {
  readonly templates: TemplateRegistry;
  readonly document?: DocumentManifest;
  readonly tokens?: ThemeTokens;
  /**
   * Responsive breakpoints (max-width px) for the `tablet`/`mobile` buckets.
   * Feed both the SSR style emitter's @media maxima and the editor's
   * device-switch canvas widths, so preview equals shipped. Defaults to
   * `DEFAULT_BREAKPOINTS` (991/640) when unspecified.
   */
  readonly breakpoints?: ThemeBreakpoints;
  /**
   * Shortcodes the theme declares without a setup hook (like `tokens`).
   * These take precedence over plugin and core shortcodes of the same tag
   * — the most site-specific layer wins.
   */
  readonly shortcodes?: readonly ShortcodeSpec[];
  /**
   * Paths (relative to the project root or aliased) to CSS / asset files
   * that should ship as client bundles. Mirror of Nuxt's `css: []` — the
   * strings never enter jiti's module graph; the plumix Vite plugin
   * generates a synthetic client entry that imports each path so Vite
   * resolves them through its normal graph and emits hashed bundles.
   */
  readonly css?: readonly string[];
}

const TOKEN_SLUG_RE = /^[a-z][a-z0-9-]*$/;
const TOKEN_VALUE_FORBIDDEN_CHARS = /[;{}\\\n\r]|\/\*|\*\//;

export function defineTheme(descriptor: ThemeDescriptor): ThemeDescriptor {
  // Defense-in-depth: the type system already requires `templates.index`,
  // but JS callers can drop it. The hierarchy walker terminates at
  // `index`, so an absent fallback would render blank pages.
  const templates = descriptor.templates as Readonly<Record<string, unknown>>;
  if (!templates.index) {
    throw ThemeRegistrationError.missingIndexTemplate();
  }
  if ("templateDeps" in descriptor) {
    throw ThemeRegistrationError.legacyTemplateDepsShape();
  }
  // Function-form deps are template-only: they need a parent. The theme
  // root has none, so reject the form here instead of letting it silently
  // no-op.
  for (const [key, value] of Object.entries(descriptor)) {
    if (RESERVED_DEP_KIND_NAMES.has(key)) continue;
    if (typeof value === "function") {
      throw ThemeRegistrationError.themeDepFunctionForm(key);
    }
  }
  if (descriptor.tokens) {
    validateTokens(descriptor.tokens);
  }
  return descriptor;
}

// Post-filter validation: catches malformed contributions at boot
// (before any request can render). Validates the two cases the renderer
// can't recover from gracefully — link entries without `rel` (browsers
// ignore them, invalid HTML) and scripts with no src + no inline body
// (dead weight, signals a plugin bug worth surfacing loud).
export function validateDocumentManifest(
  manifest: DocumentManifest,
  slot?: string,
): void {
  manifest.link?.forEach((entry, index) => {
    if (typeof entry.rel !== "string" || entry.rel.length === 0) {
      throw ThemeRegistrationError.documentInvalidLink({ index, slot });
    }
  });
  manifest.script?.forEach((entry, index) => {
    const hasSrc = typeof entry.src === "string" && entry.src.length > 0;
    const hasChildren =
      typeof entry.children === "string" && entry.children.length > 0;
    const hasInnerHtml =
      typeof entry.dangerouslySetInnerHTML?.__html === "string" &&
      entry.dangerouslySetInnerHTML.__html.length > 0;
    if (!hasSrc && !hasChildren && !hasInnerHtml) {
      throw ThemeRegistrationError.documentInvalidScript({ index, slot });
    }
  });
}

function validateTokens(tokens: ThemeTokens): void {
  for (const group of ["colors", "spacing", "typography", "border"] as const) {
    const entries = tokens[group];
    if (!entries) continue;
    for (const [slug, entry] of Object.entries(entries)) {
      if (!TOKEN_SLUG_RE.test(slug)) {
        throw ThemeError.invalidTokenSlug({ group, slug });
      }
      if (entry.value === undefined) continue;
      if (TOKEN_VALUE_FORBIDDEN_CHARS.test(entry.value)) {
        throw ThemeError.invalidTokenValue({
          group,
          slug,
          value: entry.value,
        });
      }
    }
  }
}
