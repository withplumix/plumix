import type { BlockSpec } from "plumix/blocks";

import { audioBlock } from "./blocks/audio/index.js";
import { fileBlock } from "./blocks/file/index.js";
import { galleryBlock } from "./blocks/gallery/index.js";
import { imageBlock } from "./blocks/image/index.js";
import { videoBlock } from "./blocks/video/index.js";

// Browser-clean canonical list — no server-side imports — so the
// admin chunk can pull it without transitively dragging in the
// plugin's RPC routes, upload handler, or `definePlugin`.
export const mediaBlocks: readonly BlockSpec[] = Object.freeze([
  imageBlock,
  galleryBlock,
  videoBlock,
  audioBlock,
  fileBlock,
]);
