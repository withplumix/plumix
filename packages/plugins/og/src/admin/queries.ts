import { createPluginRpcClient } from "plumix/admin";

import type { CardPreview } from "../preview.js";

const rpc = createPluginRpcClient("og");

/** Ask the plugin's own procedure what this entry will be shared with. */
export function fetchCardPreview(entryId: number): Promise<CardPreview> {
  return rpc.call<CardPreview>("preview", { entryId });
}
