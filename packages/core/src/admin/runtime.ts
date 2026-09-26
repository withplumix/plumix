// Build-time alias contract: which bare specifiers the host shares
// with plugin chunks, and what slug under `plumix/admin/<slug>` each
// resolves to, and the key admin's `window.plumix.runtime` exposes that
// library's namespace under for the shim to read. Lives in core so admin (which only depends on core) and
// plumix's vite plugin can both reach it. The shim modules themselves
// live in `plumix/admin/*` because they import React types — keeping
// those out of core means core stays React-free.

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
  // oRPC client + tanstack-query bridge — plugin pages call their
  // server-registered RPC routes via these. Sharing the modules with
  // the host means plugin queries hit the QueryClient cache the admin
  // already populates from its own `auth.session` etc.
  "@orpc/client": { slug: "orpc-client", runtimeKey: "orpcClient" },
  "@orpc/client/fetch": {
    slug: "orpc-client-fetch",
    runtimeKey: "orpcClientFetch",
  },
  "@orpc/tanstack-query": {
    slug: "orpc-tanstack-query",
    runtimeKey: "orpcTanstackQuery",
  },
  // Lingui — must share `@lingui/core`'s i18n singleton (catalogs + active
  // locale) AND `@lingui/react`'s context (the I18nProvider admin mounts
  // at boot). Without these shims plugin chunks see a separate Lingui
  // instance and `useLingui()` returns null inside plugin routes.
  "@lingui/core": { slug: "lingui-core", runtimeKey: "linguiCore" },
  "@lingui/react": { slug: "lingui-react", runtimeKey: "linguiReact" },
  // Substrates the shared shadcn components (`plumix/admin/ui`) sit on.
  // `radix-ui` carries React context (Tooltip/Dialog/Popover providers) —
  // sharing the host instance lets a plugin's `<Tooltip>` find the shell's
  // `<TooltipProvider>`. `sonner`'s `toast()` is a module singleton bound
  // to the shell's mounted `<Toaster>`. `tailwind-merge` backs `cn()`.
  // One shim each keeps these out of every plugin chunk (~21KB gzip saved).
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

/** Specifier → the runtime key its shim reads (e.g. `react-dom` → `reactDom`). */
export const SHARED_ADMIN_RUNTIME_KEYS: Readonly<
  Record<SharedAdminRuntimeSpecifier, SharedAdminRuntimeKey>
> = Object.fromEntries(
  Object.entries(SHIMS).map(([spec, { runtimeKey }]) => [spec, runtimeKey]),
) as Readonly<Record<SharedAdminRuntimeSpecifier, SharedAdminRuntimeKey>>;
