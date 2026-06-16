import type { Linter } from "eslint";

import {
  baseConfig,
  NO_THROW_NEW_ERROR_SELECTOR,
  noInternalImports,
} from "./base.js";
import { i18nConfig } from "./i18n.js";
import { reactConfig } from "./react.js";

// A plugin's admin entry must NOT register its page imperatively. The
// admin plugin bundler synthesises `registerPluginPage(path, Component)`
// from each `ctx.registerAdminPage({ component })` declaration AND runs
// the entry's module body — so an imperative call registers the page a
// second time, throwing AdminPluginRegistryError at admin boot. This only
// surfaces in `plumix build` output (never `plumix dev`), so no e2e
// catches it; the lint guard does. The entry should only re-export its
// component by name (see the media plugin). Field types / blocks / marks
// have their own imperative paths and are deliberately not covered here.
export const NO_IMPERATIVE_REGISTER_PLUGIN_PAGE_SELECTOR = {
  selector: "CallExpression[callee.property.name='registerPluginPage']",
  message:
    "Don't call registerPluginPage in plugin source — the admin bundler synthesises it from ctx.registerAdminPage({ component }). An imperative call double-registers the page and throws AdminPluginRegistryError at admin boot. Re-export the component by name instead (see the media plugin's admin entry).",
} as const;

/**
 * Shared ESLint flat-config bundle for first-party plumix plugin
 * packages. Composes `baseConfig + reactConfig + noInternalImports +
 * i18nConfig + locales-ignore` so consumer files collapse to a single
 * spread.
 */
export function pluginConfig(): readonly Linter.Config[] {
  return [
    ...baseConfig,
    ...reactConfig,
    ...noInternalImports,
    ...i18nConfig,
    {
      files: ["src/**/*.ts", "src/**/*.tsx"],
      ignores: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/test/**"],
      rules: {
        "no-restricted-syntax": [
          "error",
          NO_THROW_NEW_ERROR_SELECTOR,
          NO_IMPERATIVE_REGISTER_PLUGIN_PAGE_SELECTOR,
        ],
      },
    },
    // Compiled Lingui catalogs ship with /* eslint-disable */ headers;
    // tripping the unused-disable check on every build adds no signal.
    { ignores: ["locales/**"] },
  ];
}
