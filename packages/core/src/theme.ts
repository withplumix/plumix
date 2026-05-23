import type { ComponentType, ReactElement, ReactNode } from "react";

import type { ThemeTokens } from "@plumix/blocks";

import type {
  ArchiveData,
  ErrorData,
  FrontPageData,
  SingleData,
  TaxonomyData,
} from "./route/render/resolved-entry.js";
import { ThemeError, ThemeRegistrationError } from "./theme-errors.js";

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

export type ThemeDocument = (props: {
  readonly data: TemplateData;
  readonly request: Request;
  readonly children: ReactNode;
}) => ReactElement;

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
  readonly document?: ThemeDocument;
  readonly tokens?: ThemeTokens;
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
