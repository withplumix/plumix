import type { ComponentType, JSX } from "react";

import type { ThemeTokens } from "@plumix/blocks";

import type {
  ArchiveData,
  ErrorData,
  FrontPageData,
  SingleData,
  TaxonomyData,
} from "./route/render/resolved-entry.js";
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
  | ErrorData;

export type TemplateComponent<Data> = ComponentType<{ readonly data: Data }>;

// Catch-all for the registry's index signature. The narrow per-key
// slots can't share a single typed slot due to contravariance, so the
// signature accepts any concrete-shape component (`single-{type}`,
// `archive-{type}`, …) or one written against the full union.
type DynamicTemplateComponent =
  | TemplateComponent<SingleData>
  | TemplateComponent<ArchiveData>
  | TemplateComponent<TaxonomyData>
  | TemplateComponent<FrontPageData>
  | TemplateComponent<ErrorData>
  | TemplateComponent<TemplateData>;

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
}

export interface TemplateRegistry {
  readonly index: TemplateComponent<TemplateData>;
  readonly single?: TemplateComponent<SingleData>;
  readonly singular?: TemplateComponent<SingleData>;
  readonly page?: TemplateComponent<SingleData>;
  readonly archive?: TemplateComponent<ArchiveData>;
  readonly taxonomy?: TemplateComponent<TaxonomyData>;
  readonly category?: TemplateComponent<TaxonomyData>;
  readonly tag?: TemplateComponent<TaxonomyData>;
  readonly "front-page"?: TemplateComponent<FrontPageData>;
  readonly home?: TemplateComponent<FrontPageData>;
  readonly "404"?: TemplateComponent<ErrorData>;
  readonly "500"?: TemplateComponent<ErrorData>;
  readonly [key: string]: DynamicTemplateComponent | undefined;
}

export interface ThemeDescriptor {
  readonly templates: TemplateRegistry;
  readonly document?: DocumentManifest;
  readonly tokens?: ThemeTokens;
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
  for (const group of ["colors", "spacing", "typography", "border"] as const) {
    const entries = tokens[group];
    if (!entries) continue;
    for (const [slug, entry] of Object.entries(entries)) {
      if (!TOKEN_SLUG_RE.test(slug)) {
        throw ThemeError.invalidTokenSlug({ group, slug });
      }
      if (
        typeof entry.value !== "string" ||
        TOKEN_VALUE_FORBIDDEN_CHARS.test(entry.value)
      ) {
        throw ThemeError.invalidTokenValue({
          group,
          slug,
          value: String(entry.value),
        });
      }
    }
  }
}
