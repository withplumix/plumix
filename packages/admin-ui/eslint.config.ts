import { defineConfig } from "eslint/config";

import { adminUiConfig, baseConfig } from "@plumix/eslint-config/base";
import { reactConfig } from "@plumix/eslint-config/react";

export default defineConfig(baseConfig, adminUiConfig, reactConfig, {
  // Vendored shadcn/ui primitives (plus the `cn` helper and the
  // `useIsMobile` hook shadcn ships with the sidebar) — kept verbatim, bar one
  // edit marked PLUMIX DIVERGENCE in `sidebar.tsx`, so `shadcn diff` upgrades
  // don't merge-conflict. Lint these like we lint node_modules: we don't. Named
  // one by one so our own components, and the generated `index.ts` barrel,
  // stay linted.
  ignores: [
    "src/accordion.tsx",
    "src/alert-dialog.tsx",
    "src/alert.tsx",
    "src/avatar.tsx",
    "src/badge.tsx",
    "src/breadcrumb.tsx",
    "src/button.tsx",
    "src/card.tsx",
    "src/checkbox.tsx",
    "src/command.tsx",
    "src/dialog.tsx",
    "src/dropdown-menu.tsx",
    "src/empty.tsx",
    "src/field.tsx",
    "src/form.tsx",
    "src/input-group.tsx",
    "src/input.tsx",
    "src/kbd.tsx",
    "src/label.tsx",
    "src/pagination.tsx",
    "src/popover.tsx",
    "src/radio-group.tsx",
    "src/scroll-area.tsx",
    "src/select.tsx",
    "src/separator.tsx",
    "src/sheet.tsx",
    "src/sidebar.tsx",
    "src/skeleton.tsx",
    "src/slider.tsx",
    "src/sonner.tsx",
    "src/switch.tsx",
    "src/table.tsx",
    "src/tabs.tsx",
    "src/textarea.tsx",
    "src/toggle-group.tsx",
    "src/toggle.tsx",
    "src/tooltip.tsx",
    "src/utils.ts",
    "src/use-mobile.ts",
  ],
});
