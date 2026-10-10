import type { Linter } from "eslint";

import {
  baseConfig,
  NO_INTERNAL_MODULE_AUGMENTATION_SELECTOR,
  NO_THROW_NEW_ERROR_SELECTOR,
  noInternalImports,
} from "./base.js";
import { i18nConfig } from "./i18n.js";
import { reactConfig } from "./react.js";

/**
 * The bundler already registers each declared page, so an imperative call
 * throws at admin boot, and only in `plumix build` output, where no e2e
 * looks.
 */
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
          NO_INTERNAL_MODULE_AUGMENTATION_SELECTOR,
        ],
      },
    },
    // Only `src/admin/` renders into the admin shell; the rest of a plugin
    // runs on the server, where nothing reaches a screen.
    {
      files: ["src/admin/**/*.ts", "src/admin/**/*.tsx"],
      ignores: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/test/**"],
      rules: { "plumix/no-error-message-in-ui": "error" },
    },
    // Compiled Lingui catalogs ship with /* eslint-disable */ headers;
    // tripping the unused-disable check on every build adds no signal.
    { ignores: ["locales/**"] },
  ];
}
