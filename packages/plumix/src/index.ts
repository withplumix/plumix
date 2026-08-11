export * from "@plumix/core";

// Surface the block/pattern augmentation seams on the root `plumix`
// specifier so consumers extend every registry through one module —
// `declare module "plumix"` — rather than reaching into the internal
// `@plumix/blocks` package. Type-only: the block value API stays on the
// `plumix/blocks` subpath.
export type {
  BlockTypeRegistry,
  PatternCategoryRegistry,
} from "@plumix/blocks";
