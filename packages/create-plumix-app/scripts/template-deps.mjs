/**
 * Single source of truth for the dep overrides both drift-detection
 * scripts apply to the template's `package.json` before running
 * `pnpm install`. The template pins plumix-shipped packages at
 * `^0.1.0` (target release; not on npm yet), so for local verification
 * we swap them to `workspace:*` and shared externals to `catalog:`.
 *
 * If the template gains a new dep, add it here — both
 * `typecheck-template.mjs` and `verify-scaffold.mjs` consume this.
 */
export const TEMPLATE_DEP_OVERRIDES = {
  plumix: "workspace:*",
  "@plumix/runtime-cloudflare": "workspace:*",
  "@plumix/plugin-blog": "workspace:*",
  "@plumix/plugin-pages": "workspace:*",
  "drizzle-orm": "catalog:",
  react: "catalog:",
  "react-dom": "catalog:",
  "@cloudflare/workers-types": "catalog:",
  "@types/node": "catalog:",
  "@types/react": "catalog:",
  "@types/react-dom": "catalog:",
  "drizzle-kit": "catalog:",
  typescript: "catalog:",
  wrangler: "catalog:",
};
