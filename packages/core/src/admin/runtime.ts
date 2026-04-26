// Build-time alias contract: which bare specifiers the host shares
// with plugin chunks, and what slug under `plumix/admin/<slug>` each
// resolves to. Lives in core so admin (which only depends on core) and
// plumix's vite plugin can both reach it. The shim modules themselves
// live in `plumix/admin/*` because they import React types — keeping
// those out of core means core stays React-free.

const SHIM_SLUGS = {
  react: "react",
  "react/jsx-runtime": "react-jsx-runtime",
  "react-dom": "react-dom",
  "react-dom/client": "react-dom-client",
  "@tanstack/react-query": "react-query",
  "@tanstack/react-router": "react-router",
} as const satisfies Record<string, string>;

export type SharedAdminRuntimeSpecifier = keyof typeof SHIM_SLUGS;

/** Slug under `plumix/admin/<slug>` (and `plumix/dist/admin/<slug>.js`). */
export function adminRuntimeShimSlug(
  specifier: SharedAdminRuntimeSpecifier,
): string {
  return SHIM_SLUGS[specifier];
}

/** Specifier → full sub-export path (e.g. `react` → `plumix/admin/react`). */
export const SHARED_ADMIN_RUNTIME_SPECIFIERS: Readonly<
  Record<SharedAdminRuntimeSpecifier, string>
> = Object.fromEntries(
  Object.entries(SHIM_SLUGS).map(([spec, slug]) => [
    spec,
    `plumix/admin/${slug}`,
  ]),
) as Readonly<Record<SharedAdminRuntimeSpecifier, string>>;
