/**
 * Public `plumix/admin/ui` surface.
 *
 * Re-exports the shared shadcn/ui primitives from the workspace-internal
 * `@plumix/admin-ui` package — the same components the admin shell renders.
 * Plugin admin chunks import from here; `@plumix/admin-ui` is never a direct
 * dependency in their `package.json`.
 *
 * Unlike the sibling `plumix/admin/*` runtime shims (react, radix-ui, …),
 * this surface ships real component source: the plugin-bundle Vite step
 * bundles it into the plugin chunk, where the components' own `react` /
 * `radix-ui` / `sonner` / `tailwind-merge` imports are aliased to the shared
 * runtime shims — so the chunk carries only the thin wrappers (~1KB each),
 * not radix.
 */
export * from "@plumix/admin-ui";
