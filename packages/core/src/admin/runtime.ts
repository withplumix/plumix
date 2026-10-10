// In core so admin and the Vite plugin can both reach it; the shim modules
// live in `plumix/admin/*` because they import React types.

const SHIMS = {
  react: { slug: "react", runtimeKey: "react" },
  "react/jsx-runtime": {
    slug: "react-jsx-runtime",
    runtimeKey: "reactJsxRuntime",
  },
  "react-dom": { slug: "react-dom", runtimeKey: "reactDom" },
  "react-dom/client": {
    slug: "react-dom-client",
    runtimeKey: "reactDomClient",
  },
  "@tanstack/react-query": { slug: "react-query", runtimeKey: "reactQuery" },
  "@tanstack/react-router": { slug: "react-router", runtimeKey: "reactRouter" },
  // Shared so plugin queries hit the QueryClient cache the admin already
  // populates.
  "@orpc/client": { slug: "orpc-client", runtimeKey: "orpcClient" },
  "@orpc/client/fetch": {
    slug: "orpc-client-fetch",
    runtimeKey: "orpcClientFetch",
  },
  "@orpc/tanstack-query": {
    slug: "orpc-tanstack-query",
    runtimeKey: "orpcTanstackQuery",
  },
  // Without these, plugin chunks get a separate Lingui instance and
  // `useLingui()` returns null inside plugin routes.
  "@lingui/core": { slug: "lingui-core", runtimeKey: "linguiCore" },
  "@lingui/react": { slug: "lingui-react", runtimeKey: "linguiReact" },
  // Shared so a plugin's `<Tooltip>` finds the shell's provider and `toast()`
  // reaches its `<Toaster>`; also keeps ~21KB gzip out of every plugin chunk.
  "radix-ui": { slug: "radix", runtimeKey: "radix" },
  sonner: { slug: "sonner", runtimeKey: "sonner" },
  "tailwind-merge": { slug: "tailwind-merge", runtimeKey: "tailwindMerge" },
} as const satisfies Record<
  string,
  { readonly slug: string; readonly runtimeKey: string }
>;

export type SharedAdminRuntimeSpecifier = keyof typeof SHIMS;

/** Property of admin's `window.plumix.runtime` a shared library sits under. */
export type SharedAdminRuntimeKey =
  (typeof SHIMS)[SharedAdminRuntimeSpecifier]["runtimeKey"];

/** Slug under `plumix/admin/<slug>` (and `plumix/dist/admin/<slug>.js`). */
export function adminRuntimeShimSlug(
  specifier: SharedAdminRuntimeSpecifier,
): string {
  return SHIMS[specifier].slug;
}

/** Specifier → full sub-export path (e.g. `react` → `plumix/admin/react`). */
export const SHARED_ADMIN_RUNTIME_SPECIFIERS: Readonly<
  Record<SharedAdminRuntimeSpecifier, string>
> = Object.fromEntries(
  Object.entries(SHIMS).map(([spec, { slug }]) => [
    spec,
    `plumix/admin/${slug}`,
  ]),
) as Readonly<Record<SharedAdminRuntimeSpecifier, string>>;

/**
 * Specifier → the runtime key its shim reads (e.g. `react-dom` → `reactDom`).
 */
export const SHARED_ADMIN_RUNTIME_KEYS: Readonly<
  Record<SharedAdminRuntimeSpecifier, SharedAdminRuntimeKey>
> = Object.fromEntries(
  Object.entries(SHIMS).map(([spec, { runtimeKey }]) => [spec, runtimeKey]),
) as Readonly<Record<SharedAdminRuntimeSpecifier, SharedAdminRuntimeKey>>;
