import type { AnyPluginDescriptor } from "../config.js";
import type { PluginRegistry } from "../plugin/registry.js";
import { HookRegistry } from "../hooks/registry.js";
import { definePlugin } from "../plugin/define.js";
import { installPlugins } from "../plugin/register.js";

/**
 * Registers `news` pooling its permissions with `post`: a role holding
 * `entry:post:*` reaches news rows and `entry:news:*` is never minted. The
 * plugin itself, for a harness that assembles an app from descriptors.
 */
export const pooledEntryTypesPlugin = definePlugin("site", (ctx) => {
  ctx.registerEntryType("post", { label: "Posts" });
  ctx.registerEntryType("news", { label: "News", capabilityType: "post" });
});

/**
 * The registry `pooledEntryTypesPlugin` builds, through registration itself so
 * the namespace is resolved the way an app's is. `plugins` install after it,
 * for a suite whose subject registers something that names the types.
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
