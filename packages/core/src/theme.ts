import type { ComponentType } from "react";

import type {
  BlockSpec,
  ShortcodeSpec,
  ThemeBreakpoints,
  ThemeTokens,
} from "./blocks/index.js";
import type { DocumentManifest } from "./document-manifest.js";
import type { MailOverrides } from "./mail/contract/registry.js";
import type { RedirectRule } from "./route/contract/redirects.js";
import type {
  ArchiveTypeData,
  AuthorArchiveData,
  DateArchiveData,
  EntryData,
  EntryTypeArchiveData,
  ErrorData,
  FrontPageData,
  SearchData,
  TermArchiveData,
  ViewData,
} from "./route/contract/resolved-entry.js";
import type { ResolvedNode } from "./route/contract/resolved-node.js";
import type { Template, TemplateDepDeclarations } from "./template.js";
import type { ViewTransitionsInput } from "./theme-view-transitions.js";
import { isReservedBlockName } from "./blocks/index.js";
import { RESERVED_DEP_KIND_NAMES } from "./template-deps.js";
import { ThemeError, ThemeRegistrationError } from "./theme-errors.js";

declare module "./hooks/types.js" {
  interface FilterRegistry {
    /**
     * Threads the theme's own `document` manifest (or `{}` if absent) through
     * every registered filter. The merged result is frozen on
     * `PlumixApp.document` so per-request renders pay zero merge cost.
     */
    "theme:document": (
      manifest: DocumentManifest,
    ) => DocumentManifest | Promise<DocumentManifest>;
  }

  interface ActionRegistry {
    /**
     * Boot-time handover of the theme's own descriptor, fired once after
     * plugins install and before core aggregates anything — so a subscriber
     * that registers off the back of what it read is still in time for every
     * registry below.
     *
     * An action rather than a filter, because the descriptor is not the
     * plugin's to rewrite, and because `applyFilter` structured-clones its
     * input — which a descriptor carrying template components cannot survive.
     */
    "theme:ready": (theme: ThemeDescriptor) => void | Promise<void>;
  }
}

/**
 * Discriminated union of every data shape a template can receive. Per-kind
 * templates (`entry`, `entryType`, …) narrow via the registry; a template that
 * receives the whole union (like `index`) discriminates on the `kind` field —
 * a `switch (data.kind)` gets exhaustiveness, or use the `isEntry`/`isTerm`/…
 * guards below for single-branch checks.
 */
export type TemplateData =
  | EntryData
  | EntryTypeArchiveData
  | TermArchiveData
  | AuthorArchiveData
  | DateArchiveData
  | ArchiveTypeData
  | ViewData
  | FrontPageData
  | SearchData
  | ErrorData;

export function isEntry(data: TemplateData): data is EntryData {
  return data.kind === "entry";
}
export function isEntryType(data: TemplateData): data is EntryTypeArchiveData {
  return data.kind === "entryType";
}
export function isTerm(data: TemplateData): data is TermArchiveData {
  return data.kind === "term";
}
export function isAuthor(data: TemplateData): data is AuthorArchiveData {
  return data.kind === "author";
}
export function isDate(data: TemplateData): data is DateArchiveData {
  return data.kind === "date";
}
export function isArchiveType(data: TemplateData): data is ArchiveTypeData {
  return data.kind === "archiveType";
}
export function isView(data: TemplateData): data is ViewData {
  return data.kind === "view";
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
 * page-kind tier (`entry`, `entryType`, `term`, `author`, `date`, `frontPage`,
 * `search`) serves the resolved node of the same kind, plus `fallback`
 * (the universal catch-all) and the `notFound`/`serverError` condition handlers.
 * Type/term-specific matchers arrive in a later slice.
 */
export type GenericTier =
  | "fallback"
  | "entry"
  | "entryType"
  | "term"
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
  readonly nodeKind: Exclude<ResolvedNode["kind"], "frontPage" | "search">;
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
 * The part of a rule that resolution reads: a generic `tier` or a targeted
 * `match` — exactly one, as the builders never produce both. Payload-free, so
 * any rule kind declared against the node hierarchy resolves through the one
 * `resolveRule` instead of carrying its own copy of the precedence walk.
 */
export interface TierMatchRule {
  readonly tier?: GenericTier;
  readonly match?: TargetMatcher;
}

/**
 * One entry in a theme's `templates` array: a template bound to either a
 * generic `tier` or a targeted `match`. Exactly one is set — the builders never
 * produce both.
 */
export interface TemplateRule extends TierMatchRule {
  readonly template: TemplateEntry<TemplateData>;
}

export interface ThemeDescriptor extends TemplateDepDeclarations {
  /**
   * The theme's templates: an array of builder rules (`fallback(...)`,
   * `forEntryType(...).template(...)`, …), or a bare component as fallback-only
   * shorthand.
   */
  readonly templates: readonly TemplateRule[] | TemplateEntry<TemplateData>;
  /**
   * Presentation blocks the theme owns (charts, callouts, …), declared
   * statically like {@link ThemeDescriptor.shortcodes} (themes have no setup
   * hook). They merge into the per-app block registry at `buildApp` with the
   * highest precedence (core < plugin < theme) — the most site-specific layer
   * wins.
   */
  readonly blocks?: readonly BlockSpec[];
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
   * Public-route redirects the theme owns — declared statically, like
   * {@link ThemeDescriptor.shortcodes} (themes have no setup hook). Use for
   * URL-structure moves that belong to the theme itself (e.g. `/post/:slug` →
   * `/blog/:slug`). These merge behind the site's `config.redirects` and
   * plugin-registered redirects (theme loses a tie). See {@link RedirectRule}.
   */
  readonly redirects?: readonly RedirectRule[];
  /**
   * Paths (relative to the project root or aliased) to CSS / asset files
   * that should ship as client bundles. Mirror of Nuxt's `css: []` — the
   * strings never enter jiti's module graph; the plumix Vite plugin
   * generates a synthetic client entry that imports each path so Vite
   * resolves them through its normal graph and emits hashed bundles.
   */
  readonly css?: readonly string[];
  /**
   * Native cross-document page transitions (ADR 0031). Off when missing.
   * When on, core emits the `@view-transition` rule in live renders; the
   * theme's CSS owns every animation.
   */
  readonly viewTransitions?: ViewTransitionsInput;
  /**
   * The theme's look for mails it did not declare, by mail name: any of a
   * mail's `subject`, `text` and `html`. A site's `mail.overrides` win over
   * these, and these over the declaring owner's own.
   */
  readonly mail?: MailOverrides;
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
  for (const block of descriptor.blocks ?? []) {
    if (isReservedBlockName(block.name)) {
      throw ThemeRegistrationError.reservedBlockNamespace(block.name);
    }
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
