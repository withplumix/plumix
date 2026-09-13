import { createPluginRpcClient } from "plumix/admin";

import type { SerpPreview } from "../serp.js";

const rpc = createPluginRpcClient("seo");

/** Ask the plugin's own procedure what this entry resolves to. */
export function fetchSerpPreview(entryId: number): Promise<SerpPreview> {
  return rpc.call<SerpPreview>("preview", { entryId });
}
