import type {
  DocumentAttrs,
  DocumentManifest,
  DocumentViewport,
} from "./document-manifest.js";

/**
 * Base first, fragment last, so the fragment wins (a template over the theme,
 * a plugin over what came before). Arrays append, no dedupe; attributes are
 * last-wins except `className`, which concatenates.
 */
export function mergeDocumentManifest(
  theme: DocumentManifest,
  fragment: DocumentManifest | undefined,
): DocumentManifest {
  return {
    html: mergeAttrs(theme.html, fragment?.html),
    body: mergeAttrs(theme.body, fragment?.body),
    link: concatArrays(theme.link, fragment?.link),
    meta: concatArrays(theme.meta, fragment?.meta),
    script: concatArrays(theme.script, fragment?.script),
    title: fragment?.title ?? theme.title,
    titleTemplate: fragment?.titleTemplate ?? theme.titleTemplate,
    canonical: fragment?.canonical ?? theme.canonical,
    viewport: mergeViewport(theme.viewport, fragment?.viewport),
  };
}

/** Per field, last wins; a field set to `undefined` keeps the earlier value. */
export function mergeViewport(
  theme: DocumentViewport | undefined,
  fragment: DocumentViewport | undefined,
): DocumentViewport | undefined {
  if (!theme || !fragment) return fragment ?? theme;
  const merged: Record<string, unknown> = { ...theme };
  for (const [key, value] of Object.entries(fragment)) {
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

function concatArrays<T>(
  a: readonly T[] | undefined,
  b: readonly T[] | undefined,
): readonly T[] | undefined {
  if (!a && !b) return undefined;
  return [...(a ?? []), ...(b ?? [])];
}

function mergeAttrs(
  theme: DocumentAttrs | undefined,
  fragment: DocumentAttrs | undefined,
): DocumentAttrs | undefined {
  if (!theme && !fragment) return undefined;
  const merged: Record<string, unknown> = { ...theme, ...fragment };
  const themeClass = theme?.className;
  const fragmentClass = fragment?.className;
  if (typeof themeClass === "string" && typeof fragmentClass === "string") {
    // Trim each side + normalize internal whitespace so a leading /
    // trailing space on either input (or doubled separators) doesn't
    // produce ugly `<html class=\"site  trim-me \">` output.
    merged.className = `${themeClass} ${fragmentClass}`
      .replace(/\s+/g, " ")
      .trim();
  }
  return merged;
}
