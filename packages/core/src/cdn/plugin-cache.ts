import type { AppContext, PluginCache } from "../context/app-context.js";
import { ContextError } from "../context/errors.js";
import { pluginStore } from "../context/stores.js";
import { declarePageTags } from "./contract/page-tags.js";
import { pluginChangedTags, pluginReadTags } from "./contract/tags.js";
import { enqueuePurgeTags } from "./purge.js";

/**
 * Reads the calling plugin from the frame core runs its code in, never from
 * an argument, so a plugin can't name another's namespace.
 */
export function createPluginCache(
  ctx: () => Pick<AppContext, "cdn" | "memo">,
): PluginCache {
  return {
    reads: (key) => {
      declarePageTags(ctx(), pluginReadTags(callingPlugin(), key));
    },
    changed: (key) => {
      enqueuePurgeTags(ctx(), pluginChangedTags(callingPlugin(), key));
    },
  };
}

function callingPlugin(): string {
  const pluginId = pluginStore.getStore();
  if (pluginId === undefined || pluginId === null) {
    throw ContextError.cacheOutsidePlugin();
  }
  return pluginId;
}
