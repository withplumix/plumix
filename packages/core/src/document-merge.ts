import type { DocumentManifest } from "./theme.js";

/**
 * Merge a template's per-template document fragment onto the theme's
 * site-wide merged document. Theme bytes always come first so the
 * cascade lands template overrides last (which is what authors expect:
 * "this template adds X / overrides Y").
 *
 * Rules:
 *  - `link[]` / `meta[]` / `script[]` arrays: theme entries first,
 *    template entries appended. v1 does no identity-based dedupe —
 *    `<link rel="canonical">` declared in both theme and template
 *    surfaces twice (per the PRD).
 *  - `html` / `body` attribute objects: scalar fields last-wins
 *    (template overrides theme), `className` space-concatenated +
 *    whitespace-normalized.
 *
 * Returns a new object — callers freeze the result if they want to
 * lock it down (e.g. boot-time precomputation on `PlumixApp`).
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
  theme: Readonly<Record<string, unknown>> | undefined,
  fragment: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> | undefined {
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
