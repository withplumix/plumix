// The root is what a site's `plumix.config.ts` writes. Everything else has one
// import path of its own, picked by who writes against it: a theme file
// (`plumix/theme`), a plugin (`plumix/plugin`), a runtime adapter
// (`plumix/runtime`), anyone wiring identity or access (`plumix/auth`), and
// framework-free helpers (`plumix/support`). `facade-curated.test.ts` fails on
// a value published twice, and on a core export nobody has placed.
//
// Types stay wholesale here, and only here are they complete. The declaration
// emitter prints a type through the specifier with the fewest path components,
// and a consumer's `.d.ts` can only resolve `plumix`, never `@plumix/core`
// (#2347). The root is also the one module every `declare module "plumix"`
// augmentation targets.
export type * from "@plumix/core";

// Surface the block/pattern augmentation seams on the root `plumix`
// specifier so consumers extend every registry through one module —
// `declare module "plumix"` — rather than reaching into the internal
// `@plumix/blocks` package. Type-only: the block value API stays on the
// `plumix/blocks` subpath.
export type {
  BlockTypeRegistry,
  PatternCategoryRegistry,
} from "@plumix/blocks";

export {
  consoleMailer,
  defineConfig,
  plumix,
  PlumixConfigError,
  resolveEnvInput,
} from "@plumix/core";
