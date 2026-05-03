import type { MutablePluginRegistry } from "../../plugin/manifest.js";
import { userLookupAdapter } from "./user/lookup.js";

// Core adapters seed the registry before plugins install so plugin-
// supplied kinds can't collide with built-ins (`registerLookupAdapter`
// throws on duplicate kind). Today this only covers `user` — `entry`
// and `term` adapters land in subsequent slices.

export function registerCoreLookupAdapters(
  registry: MutablePluginRegistry,
): void {
  registry.lookupAdapters.set("user", {
    kind: "user",
    adapter: userLookupAdapter,
    // Picker enumerates email + name; matches the `user.list` gate.
    capability: "user:list",
    registeredBy: null,
  });
}
