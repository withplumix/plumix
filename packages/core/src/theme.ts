import type { ComponentType, ReactElement, ReactNode } from "react";

import type { ThemeTokens } from "@plumix/blocks";

import type { SingleData } from "./route/render/resolved-entry.js";
import { ThemeError, ThemeRegistrationError } from "./theme-errors.js";

/**
 * Per-kind data union templates receive. Only `SingleData` is implemented
 * today; archive / taxonomy / front-page / error kinds widen this in
 * follow-up slices.
 */
export type TemplateData = SingleData;

export type TemplateComponent<Data> = ComponentType<{ readonly data: Data }>;

export type ThemeDocument = (props: {
  readonly data: TemplateData;
  readonly request: Request;
  readonly children: ReactNode;
}) => ReactElement;

export interface TemplateRegistry {
  readonly index: TemplateComponent<TemplateData>;
  readonly [key: string]: TemplateComponent<TemplateData>;
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
