import { defineConfig } from "eslint/config";

import { baseConfig } from "@plumix/eslint-config/base";
import { i18nStrictConfig } from "@plumix/eslint-config/i18n";
import { reactConfig } from "@plumix/eslint-config/react";

// `lingui/no-unlocalized-strings` is on for `src/**` by default. The
// list below opts surfaces out until their strings are wrapped — wrap
// a surface, drop its entry. When empty, delete the override block
// (the `defineConfig` spread below) and the gate is implicit.
const STRICT_UNWRAPPED_FILES = [
  "src/App.tsx",
  "src/components/editor/plain-form-layout.tsx",
  "src/components/editor/post-editor-form.ts",
  "src/components/form/multi-select.tsx",
  "src/components/meta-box/meta-box-grid.ts",
  "src/components/shell/app-sidebar.tsx",
  "src/components/shell/shell-header.tsx",
  "src/editor/AutosaveStatus.tsx",
  "src/editor/available-transforms.ts",
  "src/editor/block-adapter.ts",
  "src/editor/build-copy-pattern-source.ts",
  "src/editor/derive-pattern-slug.ts",
  "src/editor/detach-pattern-ref.ts",
  "src/editor/detect-stale-autosave.ts",
  "src/editor/EditorLayout.tsx",
  "src/editor/field-type-translator.ts",
  "src/editor/HeadingAuditPanel.tsx",
  "src/editor/insert-pattern.ts",
  "src/editor/insert-variation.ts",
  "src/editor/intersection-observer-harness.ts",
  "src/editor/PatternRefPreview.tsx",
  "src/editor/puck-to-block-tree.ts",
  "src/editor/puck-zones.ts",
  "src/editor/resolve-editor-mode.ts",
  "src/editor/revisions/diff.ts",
  "src/editor/revisions/PreviewBanner.tsx",
  "src/editor/revisions/RevisionDiffDialog.tsx",
  "src/editor/revisions/RevisionDiffPanel.tsx",
  "src/editor/revisions/RevisionsSheet.tsx",
  "src/editor/StaleDraftDialog.tsx",
  "src/editor/StyleTab.tsx",
  "src/editor/TokenSwatchList.tsx",
  "src/editor/viewport-bucket.ts",
  "src/lib/email-change-errors.ts",
  "src/lib/entries.ts",
  "src/lib/errors.ts",
  "src/lib/magic-link.ts",
  "src/lib/manifest.ts",
  "src/lib/passkey-errors.ts",
  "src/lib/passkey.ts",
  "src/lib/plugin-error-boundary.tsx",
  "src/lib/plugin-registry.ts",
  "src/lib/wait-for-plugin-chunks.ts",
  "src/providers/router.ts",
  "src/providers/theme.tsx",
  "src/routes/_authenticated/entries/$slug/index.tsx",
  "src/routes/_authenticated/pages/$.tsx",
  "src/routes/_authenticated/terms/$name/-errors.ts",
  "src/routes/_authenticated/terms/$name/$id/edit.tsx",
  "src/routes/_authenticated/terms/$name/create.tsx",
  "src/routes/_authenticated/terms/$name/index.tsx",
];

export default defineConfig(
  baseConfig,
  reactConfig,
  i18nStrictConfig,
  // ESLint flat config rejects `files: []`; the conditional spread
  // omits the override block when the seed shrinks to empty.
  ...(STRICT_UNWRAPPED_FILES.length > 0
    ? [
        {
          // Only `no-unlocalized-strings` relaxes here; macro-misuse
          // rules from `i18nStrictConfig` (no-trans-inside-trans, …)
          // still apply.
          files: STRICT_UNWRAPPED_FILES,
          rules: { "lingui/no-unlocalized-strings": "off" },
        },
      ]
    : []),
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
