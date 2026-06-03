import type { Linter } from "eslint";

import { baseConfig, noInternalImports } from "./base.js";
import { i18nConfig } from "./i18n.js";
import { reactConfig } from "./react.js";

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
    // Compiled Lingui catalogs ship with /* eslint-disable */ headers;
    // tripping the unused-disable check on every build adds no signal.
    { ignores: ["locales/**"] },
  ];
}
