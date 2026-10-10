import type { DocumentAttrs, DocumentManifest } from "./document-manifest.js";

/**
 * Theme first, template last, so template overrides win. Arrays append with no
 * dedupe; attributes are last-wins except `className`, which concatenates.
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
  };
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
