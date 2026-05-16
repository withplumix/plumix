/**
 * Test utilities for plugin and theme authors writing blocks.
 *
 * Imported as `plumix/blocks/test`. Re-exports `renderBlock` and
 * `mockRegistry` from the workspace-internal `@plumix/blocks/test`
 * surface so consumers can unit-test their custom blocks without
 * spinning up a full admin app.
 */

export { mockRegistry, renderBlock, EMPTY_CONTEXT } from "@plumix/blocks/test";
