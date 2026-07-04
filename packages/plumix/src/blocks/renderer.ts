/**
 * Public `plumix/blocks/renderer` surface.
 *
 * The render-time component primitives (`Image`, `Link`) and provider/hooks
 * that plugins and themes use inside block and template render. Re-exports the
 * curated public API from the workspace-internal `@plumix/blocks` package;
 * `@plumix/blocks` is never a direct dependency in a consumer's `package.json`.
 */

export {
  Image,
  Link,
  PlumixProvider,
  BlockRenderer,
  buildImageAttrs,
  matchesRemotePattern,
  useBasePath,
  useImageConfig,
  useIsEditing,
  useIsPreview,
  usePlumixMode,
  useQueriedEntry,
  useTokens,
  useUser,
} from "@plumix/blocks/renderer";
export type {
  BuildImageAttrsInput,
  ImageAttrs,
  ImageProps,
  ImageResolver,
  LinkProps,
  LinkTarget,
  PlumixContextValue,
  PlumixRenderMode,
  RemotePattern,
  RendererQueriedEntry,
  RendererUser,
} from "@plumix/blocks/renderer";
