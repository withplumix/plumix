import pluginLingui from "eslint-plugin-lingui";
import { defineConfig } from "eslint/config";

/**
 * Lingui macro-misuse rules. Opt-in for packages that render admin UI
 * (admin itself + plugins with admin chunks). Complements `plumix
 * i18n extract --check` (slice 7): the gate catches drift in wrapped
 * strings; these rules catch extractor-breaking shapes (empty
 * msgids, expressions inside messages, module-scope `t` calls).
 *
 * `no-unlocalized-strings` is deliberately NOT enabled — admin has
 * 3000+ unwrapped sites today; the wrap pass is its own slice (#684),
 * and the allowlist is best authored against real findings rather
 * than speculated upfront.
 */
export const i18nConfig = defineConfig({
  files: ["**/src/**/*.{ts,tsx}"],
  extends: [pluginLingui.configs["flat/recommended"]],
  rules: {
    // Plugin defaults are `warn` for these four (`t-call-in-function`
    // is already `error`). Promote to `error` so extractor-breaking
    // shapes block CI like every other lint failure.
    "lingui/no-trans-inside-trans": "error",
    "lingui/no-expression-in-message": "error",
    "lingui/no-single-variables-to-translate": "error",
    "lingui/no-single-tag-to-translate": "error",
  },
});
