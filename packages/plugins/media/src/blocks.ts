// The `editorBlocksModule` contract (a default-exported `BlockSpec[]`) that the
// plumix vite plugin imports into the generated editor entry so the canvas can
// render media blocks. Kept as a dedicated re-export so `media-blocks.ts` has a
// single named export (no named+default duplicate).
export { mediaBlocks as default } from "./media-blocks.js";
