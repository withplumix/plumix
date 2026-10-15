/**
 * Tests ADR 0042 retires, still awaiting their move to the unit, e2e or smoke
 * tier (#3035, #3036). Hand-authored: a migration only removes entries, and the
 * list is done when empty.
 */
export const RETIRED_TIER_PENDING: readonly string[] = [
  "packages/core/src/blocks/embed/EmbedFacade.browser.test.tsx",
  "packages/core/src/blocks/html/dompurify-shim.browser.test.ts",
  "packages/core/src/blocks/island-renderer.browser.test.tsx",
  "packages/core/src/blocks/renderer/document-base-path.browser.test.ts",
  "packages/core/src/blocks/renderer/use-auth.browser.test.tsx",
  "packages/core/src/dev-client/index.browser.test.tsx",
  "packages/core/src/dev/ui/compile-overlay.browser.test.tsx",
  "packages/core/src/dev/ui/enhance.browser.test.tsx",
  "packages/core/src/dev/ui/island-overlay.browser.test.tsx",
  "packages/core/src/dev/ui/overlay-shell.browser.test.tsx",
  "packages/core/src/dev/ui/terminal-forward.browser.test.tsx",
  "packages/plugins/media/src/admin/MediaLibrary.browser.test.tsx",
  "packages/plugins/media/src/admin/rpc.browser.test.tsx",
  "packages/plugins/media/src/admin/upload.browser.test.tsx",
  "packages/plumix/src/test/node-only.browser.test.ts",
];
