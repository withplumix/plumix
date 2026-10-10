import type { AnyPluginDescriptor } from "../config.js";
import type { PluginRegistry } from "../plugin/registry.js";
import { HookRegistry } from "../hooks/registry.js";
import { definePlugin } from "../plugin/define.js";
import { installPlugins } from "../runtime/install-plugins.js";

/**
 * Registers `news` pooling its permissions with `post`, so `entry:post:*`
 * reaches news rows and `entry:news:*` is never minted.
 */
export const pooledEntryTypesPlugin = definePlugin("site", (ctx) => {
  ctx.registerEntryType("post", { label: "Posts" });
  ctx.registerEntryType("news", { label: "News", capabilityType: "post" });
});

/**
 * The registry `pooledEntryTypesPlugin` builds, through real registration;
 * `plugins` install after it.
 */
export async function pooledEntryTypeRegistry(
  ...plugins: readonly AnyPluginDescriptor[]
): Promise<PluginRegistry> {
  const { registry } = await installPlugins({
    hooks: new HookRegistry(),
    plugins: [pooledEntryTypesPlugin, ...plugins],
  });
  return registry;
}
