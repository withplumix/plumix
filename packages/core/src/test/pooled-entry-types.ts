import type { PluginRegistry } from "../plugin/registry.js";
import { HookRegistry } from "../hooks/registry.js";
import { definePlugin } from "../plugin/define.js";
import { installPlugins } from "../plugin/register.js";

/**
 * A registry where `news` pools its permissions with `post`: a role holding
 * `entry:post:*` reaches news rows and `entry:news:*` is never minted. Built
 * through registration itself, so the namespace is resolved the way an app's
 * is.
 */
export async function pooledEntryTypeRegistry(): Promise<PluginRegistry> {
  const site = definePlugin("site", (ctx) => {
    ctx.registerEntryType("post", { label: "Posts" });
    ctx.registerEntryType("news", { label: "News", capabilityType: "post" });
  });
  const { registry } = await installPlugins({
    hooks: new HookRegistry(),
    plugins: [site],
  });
  return registry;
}
