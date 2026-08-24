---
"@plumix/blocks": minor
"@plumix/admin-editor": minor
"@plumix/plugin-media": patch
"@plumix/plugin-menu": patch
"@plumix/plugin-audit-log": patch
"@plumix/plugin-comments": patch
"@plumix/runtime-cloudflare": patch
---

Types the stored block tree and the plugin dictionaries that describe serialized data with the public `JsonObject` / `JsonValue` types.

**Source-breaking for block and theme authors** on the type level only — the emitted JS is unchanged. `BlockNode` is now a `type` alias rather than an `interface`, and its `attrs` is a `JsonObject`; the same goes for `BlockVariation.attrs`, `BlockSpec.defaults`, a transform's `mapAttrs`, a block loader's `attrs`, and `ResponsiveStyleSlot` / `VisibilityFlags`. A node built from a `Record<string, unknown>` no longer assigns, and an entry added to `BlockTypeRegistry` has to be spelled as a `type` over an object literal — TypeScript withholds the implicit index signature an `interface` would need.

What a block's `render` receives is deliberately *not* JSON and is now named and exported: `MaterializedAttrs` is the stored bag with each slot key replaced by the component that renders that slot's children. `BlockNodeRenderProps`, `BlockNodeComponent` and `BlockSpec` default their `Attrs` parameter to it.

**Source-breaking for the editor's plugin-field seam.** `@plumix/admin-editor`'s `PluginFieldControlProps` now types `rhf.onChange` as `(next: JsonValue) => void` and the sibling block `attrs` as a `JsonObject`; `rhf.value` stays `unknown`, because the same controls also serve metaboxes, where RHF hands over a live `Date` for a temporal field. The `registerPluginFieldType` registry contract itself is unchanged.

`@plumix/plugin-audit-log` holds a caller's own `properties` to JSON: `ctx.audit.log({ properties })` and an event definition's `extra` return no longer accept a `Date`, which reached storage as an ISO string anyway. The row's stored envelope stays open — its diff half is built from live entity columns.

Island props keep their open type — the prop codec encodes `Date`, `Map`, `Set`, `BigInt`, `URL` and the typed arrays so they survive hydration, which a JSON type would deny.

`@plumix/runtime-cloudflare` types the CF Access JWT payload as jose's `JWTPayload` instead of a loose dictionary.
