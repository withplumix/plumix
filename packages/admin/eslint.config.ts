import { defineConfig } from "eslint/config";

import { baseConfig } from "@plumix/eslint-config/base";
import { i18nConfig, i18nStrictOverrides } from "@plumix/eslint-config/i18n";
import { reactConfig } from "@plumix/eslint-config/react";

// Strict mode (`no-unlocalized-strings`) ratchet — every file in this
// list must stay free of raw user-facing strings. Add a file here only
// after wrapping every translatable string it contains. Slice 15
// (#684) is the umbrella tracking the expansion of this list to the
// rest of admin chrome.
const STRICT_WRAPPED_FILES = [
  "src/components/locale-switcher.tsx",
  "src/components/profile/language-card.tsx",
  "src/components/shell/user-menu.tsx",
  "src/lib/dates.ts",
  "src/lib/i18n-boot.ts",
  "src/lib/plugin-catalogs.ts",
  "src/lib/plumix-globals.ts",
  "src/lib/use-formatters.ts",
  "src/lib/use-label.ts",
  "src/routes/__root.tsx",
  "src/routes/_auth/login.tsx",
  "src/routes/_authenticated/index.tsx",
  "src/routes/_authenticated/mailer/index.tsx",
  "src/routes/_authenticated/settings/index.tsx",
  // `src/lib/breadcrumbs.ts` is intentionally excluded — `Create {singular}`
  // / `Edit {singular}` literals there need a `Crumb`-shape rework to
  // carry placeholder values before strict mode can enforce.
];

export default defineConfig(
  baseConfig,
  reactConfig,
  i18nConfig,
  {
    // Strict mode (`no-unlocalized-strings`) scoped to the ratchet list.
    // Surfaces not yet wrapped keep the macro-misuse rules from
    // `i18nConfig` (already applied above) until they're added here.
    files: STRICT_WRAPPED_FILES,
    ...i18nStrictOverrides,
  },
  {
    // Vendored shadcn/ui primitives — kept verbatim so `shadcn diff` upgrades
    // don't merge-conflict. Lint these like we lint node_modules: we don't.
    // Compiled Lingui catalogs are generated; their `/*eslint-disable*/`
    // header trips the unused-disable-directive rule.
    // E2E fixture plugins live under `e2e/fixtures/*/src/*` and aren't
    // user-facing — keep them out of the `no-unlocalized-strings` net.
    // Colocated `*.test.{ts,tsx}` files match `src/**` too; same boundary.
    ignores: [
      "src/components/ui/**",
      "src/hooks/use-mobile.ts",
      "locales/**",
      "e2e/**",
      "**/*.test.{ts,tsx}",
    ],
  },
);
