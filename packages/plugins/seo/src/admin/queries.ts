import { createPluginRpcClient } from "plumix/admin";

import type { SeoRouter } from "../rpc.js";
import type { SerpPreview } from "../serp.js";

const rpc = createPluginRpcClient<SeoRouter>("seo");

/** Ask the plugin's own procedure what this entry resolves to. */
export function fetchSerpPreview(entryId: number): Promise<SerpPreview> {
  return rpc.preview({ entryId });
}
