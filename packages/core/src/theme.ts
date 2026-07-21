import type { ComponentType, JSX } from "react";

import type {
  ShortcodeSpec,
  ThemeBreakpoints,
  ThemeTokens,
} from "@plumix/blocks";

import type {
  ArchiveData,
  AuthorArchiveData,
  CustomArchiveData,
  DateArchiveData,
  EntryData,
  ErrorData,
  FrontPageData,
  SearchData,
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
 * templates (`single`, `archive`, …) narrow via the registry; a template that
 * receives the whole union (like `index`) discriminates on the `kind` field —
 * a `switch (data.kind)` gets exhaustiveness, or use the `isEntry`/`isArchive`/…
 * guards below for single-branch checks.
 */
export type TemplateData =
  | EntryData
  | ArchiveData
  | TaxonomyData
  | AuthorArchiveData
  | DateArchiveData
  | CustomArchiveData
  | FrontPageData
  | SearchData
  | ErrorData;

export function isEntry(data: TemplateData): data is EntryData {
  return data.kind === "entry";
}
export function isArchive(data: TemplateData): data is ArchiveData {
  return data.kind === "archive";
}
export function isTaxonomy(data: TemplateData): data is TaxonomyData {
  return data.kind === "taxonomy";
}
export function isAuthor(data: TemplateData): data is AuthorArchiveData {
  return data.kind === "author";
}
export function isDate(data: TemplateData): data is DateArchiveData {
  return data.kind === "date";
}
export function isCustom(data: TemplateData): data is CustomArchiveData {
  return data.kind === "custom";
}
export function isFrontPage(data: TemplateData): data is FrontPageData {
  return data.kind === "frontPage";
}
export function isSearch(data: TemplateData): data is SearchData {
  return data.kind === "search";
}
export function isError(data: TemplateData): data is ErrorData {
  return data.kind === "error";
}

export type TemplateComponent<Data> = ComponentType<{ readonly data: Data }>;

// Per-slot entry type: either the legacy plain-function form
// (`TemplateComponent<T>`) or a `Template<T>` built via `defineTemplate`.
// The `normalizeTemplate` boot-time helper accepts both and rejects
// hand-written `{ render }` literals that didn't go through the factory.
export type TemplateEntry<Data extends TemplateData> =
  TemplateComponent<Data> | Template<Data>;

/**
 * The fixed set of generic tiers a theme's `templates` array can declare. Each
 * matches one resolved-node kind (`entry`→content, `archive`→content-type
 * archive, `taxonomy`→term, `frontPage`/`search`), plus `fallback`
 * (the universal catch-all) and the `notFound`/`serverError` condition handlers.
 * Type/term-specific matchers arrive in a later slice.
 */
export type GenericTier =
  | "fallback"
  | "entry"
  | "archive"
  | "taxonomy"
  | "author"
  | "date"
  | "frontPage"
  | "search"
  | "notFound"
  | "serverError";

/**
 * How a targeted rule (from `forEntryType`/`forTermTaxonomy`/`forAuthor`/
 * `forDate`) matches a resolved node: by node kind + type name, optionally
 * narrowed. Author matchers use a fixed `type` of `"author"`; date matchers use
 * `"date"` and narrow by `year`/`month`/`day` instead of `slug`/`id`.
 */
export interface TargetMatcher {
  readonly nodeKind:
    "content" | "content-type-archive" | "term" | "author" | "date" | "custom";
  readonly type: string;
  readonly slug?: string;
  readonly id?: number;
  /** Date-archive narrowing (`forDate`); each is exact when set. */
  readonly year?: number;
  readonly month?: number;
  readonly day?: number;
  /**
   * A runtime predicate over the resolved data (`whereMeta`/`where`/`named`),
   * evaluated after the identity match. Data-dependent, so the resolver must be
   * given the resolved data to honour it.
   */
  readonly predicate?: (data: TemplateData) => boolean;
  /** For an author-selectable (`named`) template: its id + editor label. */
  readonly named?: { readonly id: string; readonly label: string };
}

/**
 * One entry in a theme's `templates` array: a template bound to either a
 * generic `tier` or a targeted `match`. Exactly one is set — the builders never
 * produce both.
 */
export interface TemplateRule {
  readonly template: TemplateEntry<TemplateData>;
  readonly tier?: GenericTier;
  readonly match?: TargetMatcher;
}

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

export interface ThemeDescriptor extends TemplateDepDeclarations {
  /**
   * The theme's templates: an array of builder rules (`fallback(...)`,
   * `forEntryType(...).template(...)`, …), or a bare component as fallback-only
   * shorthand.
   */
  readonly templates: readonly TemplateRule[] | TemplateEntry<TemplateData>;
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
export function validateDocumentManifest(manifest: DocumentManifest): void {
  manifest.link?.forEach((entry, index) => {
    if (typeof entry.rel !== "string" || entry.rel.length === 0) {
      throw ThemeRegistrationError.documentInvalidLink({ index });
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
      throw ThemeRegistrationError.documentInvalidScript({ index });
    }
  });
}

function validateTokens(tokens: ThemeTokens): void {
  // Validate every registered group — the token model is open (any CSS
  // property), so we can't enumerate a fixed set.
  for (const [group, entries] of Object.entries(tokens)) {
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
