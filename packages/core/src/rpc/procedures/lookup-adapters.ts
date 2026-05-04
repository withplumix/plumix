import type { MutablePluginRegistry } from "../../plugin/manifest.js";
import { entryLookupAdapter } from "./entry/lookup.js";
import { termLookupAdapter } from "./term/lookup.js";
import { userLookupAdapter } from "./user/lookup.js";

// Core adapters seed the registry before plugins install so plugin-
// supplied kinds can't collide with built-ins (`registerLookupAdapter`
// throws on duplicate kind).

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
  registry.lookupAdapters.set("entry", {
    kind: "entry",
    adapter: entryLookupAdapter,
    // Picker enumerates entry titles across the requested
    // `entryTypes`. `entry:read` is granted to subscribers, so this
    // doesn't gate the picker tighter than the `entry.list` RPC
    // does — but per-type read scoping is enforced inside the
    // adapter via `inArray(entries.type, …)` from the field's scope.
    capability: null,
    registeredBy: null,
  });
  registry.lookupAdapters.set("term", {
    kind: "term",
    adapter: termLookupAdapter,
    // Term names + slugs are public (`term:<taxonomy>:read` is on the
    // subscriber baseline); per-taxonomy scoping is enforced inside
    // the adapter via `inArray(terms.taxonomy, …)`.
    capability: null,
    registeredBy: null,
  });
}
