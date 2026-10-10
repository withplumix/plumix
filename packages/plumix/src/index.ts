// Types stay wholesale here: a consumer's `.d.ts` can only resolve `plumix`,
// and every `declare module "plumix"` augmentation targets the root.
export type * from "@plumix/core";

// Augmentation seams live on the root so consumers extend every registry
// through one module.
export type {
  BlockTypeRegistry,
  PatternCategoryRegistry,
} from "@plumix/core/blocks";

export {
  consoleMailer,
  defineConfig,
  plumix,
  PlumixConfigError,
  resolveEnvInput,
} from "@plumix/core";
