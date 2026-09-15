import { createPluginRpcClient } from "plumix/admin";

import type { CardPreview } from "../preview.js";
import type { OgRouter } from "../rpc.js";

const rpc = createPluginRpcClient<OgRouter>("og");

/** Ask the plugin's own procedure what this entry will be shared with. */
export function fetchCardPreview(entryId: number): Promise<CardPreview> {
  return rpc.preview({ entryId });
}
