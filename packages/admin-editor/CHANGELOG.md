# @plumix/admin-editor

## 0.22.0

### Patch Changes

- Updated dependencies []:
  - @plumix/admin-ui@0.22.0
  - @plumix/blocks@0.22.0
  - @plumix/core@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies [[`a8a0d56`](https://github.com/withplumix/plumix/commit/a8a0d5697b8b918421d8644cf9358044abb3bc88), [`a8ab8e2`](https://github.com/withplumix/plumix/commit/a8ab8e281ce356a5df43872ea33d5e062f9b40e5), [`5e90d77`](https://github.com/withplumix/plumix/commit/5e90d774122e96336526bdaa56f45655102e38ba), [`a75d858`](https://github.com/withplumix/plumix/commit/a75d858b7a1065719df725c38648381bcab92bad), [`c2dea58`](https://github.com/withplumix/plumix/commit/c2dea582d430e025f493daec2b6e3a38520d8ec4), [`20c238d`](https://github.com/withplumix/plumix/commit/20c238dd0d6f6f8b1fe0bda93872461d6ab3117f), [`b6b9654`](https://github.com/withplumix/plumix/commit/b6b9654f28aabfba547fc8dfdcf4c35ed8ef75b4), [`27aa310`](https://github.com/withplumix/plumix/commit/27aa310171a1e44b8ebd5ae9f6b6ff42ae622efe), [`28efa5b`](https://github.com/withplumix/plumix/commit/28efa5be00ef6e40bc0bbf1b3813677c2a597de0), [`acbcae6`](https://github.com/withplumix/plumix/commit/acbcae699c69c1e90c281265728efc6a8d69687b)]:
  - @plumix/core@0.21.0
  - @plumix/admin-ui@0.21.0
  - @plumix/blocks@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [[`15b7cc9`](https://github.com/withplumix/plumix/commit/15b7cc993bb94b9e4ee9c7eb1223efa049225f29), [`6848efd`](https://github.com/withplumix/plumix/commit/6848efd2ebdcffa771ffad4238e46d869dd55664), [`155123e`](https://github.com/withplumix/plumix/commit/155123eddb77981d3391f60957d312950515f5af), [`f8f2d9d`](https://github.com/withplumix/plumix/commit/f8f2d9d128da81db7383e15b550232196a4bcc95), [`36723db`](https://github.com/withplumix/plumix/commit/36723db2903a0156a12b598a62755d2d5cf25e41), [`ef34a26`](https://github.com/withplumix/plumix/commit/ef34a26b1ae0e6892cdd694bc9507f63f5a2f3d6), [`ea3064e`](https://github.com/withplumix/plumix/commit/ea3064e633da292ea74b0f384e2373775852b255), [`823aab7`](https://github.com/withplumix/plumix/commit/823aab7e431fffa67001e7e4b8cbb2f32683e9f3), [`ee5d2b7`](https://github.com/withplumix/plumix/commit/ee5d2b74765a7d2b0931aecbc5805cbe6ef58ff4), [`9bb2509`](https://github.com/withplumix/plumix/commit/9bb250923e5b65f77a03986e65451aab497baa64), [`446a735`](https://github.com/withplumix/plumix/commit/446a7353edce4ec0f4576c0401a3f548623142c7), [`3ce10d1`](https://github.com/withplumix/plumix/commit/3ce10d14664e1c6a2e5e8ae7490cb3c3947463c4), [`5d53a81`](https://github.com/withplumix/plumix/commit/5d53a81b2e33f9e29c11459012c1d11b5c738a5e), [`511aa60`](https://github.com/withplumix/plumix/commit/511aa60bbc207c864093df16a518ba7b97eb2712)]:
  - @plumix/blocks@0.20.0
  - @plumix/core@0.20.0
  - @plumix/admin-ui@0.20.0

## 0.19.0

### Minor Changes

- [#2109](https://github.com/withplumix/plumix/pull/2109) [`dc901b1`](https://github.com/withplumix/plumix/commit/dc901b1ea30330cbdcca63f8a00e5e40f0f54e1b) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds a keyboard-shortcut cheatsheet to the editor, opened with `?`, Cmd/Ctrl+/, or the new keyboard
  button in the canvas toolbar. It lists every binding the editor claims — selection, clipboard,
  canvas, inline formatting, history — with the modifier glyphs the viewer's platform actually uses
  (⌘/⇧ on Apple, Ctrl/Shift elsewhere). `?` opens it with focus on the shell or inside the canvas
  iframe, and stands aside while the author is typing into a field or a rich-text block.

  The list is not a hand-written copy of the handlers. Bindings are declared once in a shortcut
  roster, and the key handlers — clipboard, undo/redo, the canvas view keys, the Layers delete, the
  drag cancel — now match against that roster instead of spelling their own key tests. Inline
  formatting comes from the marks' own `keyboardShortcut` metadata. A binding without a cheatsheet
  description is a type error, so the list can't quietly fall behind what the editor does. Three
  entries are described but not owned: the two pointer gestures, which no key matcher can fire, and
  Cmd/Ctrl+B for the panels, which belongs to the sidebar.

  Declaring the bindings in one place surfaced two chords that fired more than the cheatsheet would
  have printed, and both are now pinned to what they say. Cmd+Shift+X toggled x-ray as well as
  striking text through, and Cmd+Shift+C/X/V ran the block clipboard as if Shift weren't held — a
  modifier the editor doesn't name in a binding no longer silently falls through to it.

- [#2114](https://github.com/withplumix/plumix/pull/2114) [`1bd1d33`](https://github.com/withplumix/plumix/commit/1bd1d33be5585e6c935b31a390b5917528f7e455) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds a command palette scoped to editor actions, opened with Cmd/Ctrl+K inside the editor. It
  offers the actions the toolbars already carry — group, ungroup, x-ray, the three device switches —
  plus two the editor had no keyboard route to at all: inserting any block from the catalog, and
  jumping to a block by name. Escape closes it, the chord toggles it, and both work with focus on the
  shell or inside the canvas iframe.

  This is the editor's own palette, not the admin shell's. The shell's registered commands are handed
  a router and nothing else, so one could never reach the selection, the store, or the canvas camera;
  widening that context would have coupled the shell's registry to editor internals and made every
  existing command's `run` partial. The two never compete for the chord: the editor routes are a
  sibling layout of the admin shell's, so the shell palette is not mounted while the editor is.

  Jumping to a block selects it and brings the canvas to it, panning at whatever zoom the author was
  working at rather than framing the block — a jump to a button or a spacer should not turn into a
  close-up. Inserting from the palette appends at the top level and reveals the new block the same
  way, since an insert with no drop position can otherwise land off-screen. Group and ungroup are
  left out of the list when the selection cannot take them, rather than offered and then doing
  nothing.

  Unlike the cheatsheet's `?`, Cmd+K carries no typing guard: it types nothing, so it still opens the
  palette from the title field or a rich-text body. `@plumix/admin` gains the matching wiring — the
  revisions sheet is now controlled, so the palette can open it without its header trigger being
  clicked, and the command is offered only for an entry type that keeps revisions.

### Patch Changes

- [#2108](https://github.com/withplumix/plumix/pull/2108) [`1b8185e`](https://github.com/withplumix/plumix/commit/1b8185e6e289eb2f52e8abd01ac85594b765d719) Thanks [@nasyrov](https://github.com/nasyrov)! - Seeds a new entry from a starter pattern as an independent copy, whatever the pattern's `insert`
  mode says.

  The starter picker shared the inserter's `expandPattern`, which honours `insert: "reference"` by
  splicing a single `core/pattern-ref`. A starter-eligible pattern that also declared reference-mode
  therefore left every entry created from it a live pointer at the pattern: editing the pattern
  rewrote published entries, and the author had nothing to edit on the canvas. The starter path now
  expands the body directly with fresh ids; the inserter keeps honouring `reference`, which is where
  that mode is meant to apply.

- Updated dependencies [[`286d0fd`](https://github.com/withplumix/plumix/commit/286d0fd1466a39504452df07008bffc16b2333ef), [`286d0fd`](https://github.com/withplumix/plumix/commit/286d0fd1466a39504452df07008bffc16b2333ef), [`de0f56f`](https://github.com/withplumix/plumix/commit/de0f56ff7a5e96b896c9e4c81ac2f277e873cd9f), [`a74cf73`](https://github.com/withplumix/plumix/commit/a74cf731f9dd5809f12961bc1ed9a989ab1f9a08), [`b88e2f3`](https://github.com/withplumix/plumix/commit/b88e2f39608fd6b7f68d40ef989bd9d55f655a73), [`8aa171f`](https://github.com/withplumix/plumix/commit/8aa171f34e562f3a0176e802abaf63f5639002cc), [`ad062d7`](https://github.com/withplumix/plumix/commit/ad062d71bce7201f4b9bef038f1d2837e4157ae2), [`d79b4b5`](https://github.com/withplumix/plumix/commit/d79b4b597a26dd073cc32a3e89a232c58173aab0), [`3290448`](https://github.com/withplumix/plumix/commit/3290448915db0b8ee89528962a407c518c7bc29e), [`6825fbf`](https://github.com/withplumix/plumix/commit/6825fbfbbd2431e662a79af09165f323e9a8718f), [`421e39a`](https://github.com/withplumix/plumix/commit/421e39a62cd62a565e8424bb06d9d0289d69764c), [`7b36faf`](https://github.com/withplumix/plumix/commit/7b36faf5b7a0a0bcc9f5db8a244464975a5ecd42), [`022401e`](https://github.com/withplumix/plumix/commit/022401e1b77978bfe0d97cde5213609823f67329), [`fa1a0d7`](https://github.com/withplumix/plumix/commit/fa1a0d7657060e61a3f17df133f6e5e38cbccad7), [`18140f3`](https://github.com/withplumix/plumix/commit/18140f33c37fb346dc297179fe01f2792d41a350), [`8bdb8a3`](https://github.com/withplumix/plumix/commit/8bdb8a34dd366975b3e3bf967e0a3fbf63249381), [`9ebc490`](https://github.com/withplumix/plumix/commit/9ebc4901f8ad99101904901a2543ce3c32a3f695), [`4d09ee2`](https://github.com/withplumix/plumix/commit/4d09ee28b8f2f8a7dd6bcd320baf8171cf6b1df0)]:
  - @plumix/admin-ui@0.19.0
  - @plumix/blocks@0.19.0
  - @plumix/core@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies [[`fed1b0d`](https://github.com/withplumix/plumix/commit/fed1b0d8ae49cb66fdac268c29cb4067750acd66), [`f28dfe3`](https://github.com/withplumix/plumix/commit/f28dfe3fa0012e26ddb68a63405b3321bd7b85c9), [`0d81cce`](https://github.com/withplumix/plumix/commit/0d81ccefd10144ab09316386fa46cc114ec9a080), [`8e5776b`](https://github.com/withplumix/plumix/commit/8e5776b48f2b58152b0c668860258e20a51eeb9d), [`dc8bc1c`](https://github.com/withplumix/plumix/commit/dc8bc1ca95dccdc0ca1ab149fa8c1420ea1891d9), [`f50a4b9`](https://github.com/withplumix/plumix/commit/f50a4b9d210cf158f2eff6368696f614d27c9435), [`9967c91`](https://github.com/withplumix/plumix/commit/9967c91f3406290fe8ebab250fbd2cf3da008e1e), [`6e0f239`](https://github.com/withplumix/plumix/commit/6e0f2394a08dd7c961c0be6b3b593884aaedf624)]:
  - @plumix/core@0.18.0
  - @plumix/admin-ui@0.18.0
  - @plumix/blocks@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [[`db7cdba`](https://github.com/withplumix/plumix/commit/db7cdbaaaec94601ff4f630559ccb0d01bfde33f), [`06dee0c`](https://github.com/withplumix/plumix/commit/06dee0c4de59a7d93f1545f75bd93e63b1c0199c), [`228ef18`](https://github.com/withplumix/plumix/commit/228ef184588c7815a029f51bb764a15de022dde7), [`f169434`](https://github.com/withplumix/plumix/commit/f1694341ec80ac99e9f31243605f35fbb7c6f823), [`7bbef7c`](https://github.com/withplumix/plumix/commit/7bbef7c47a4ddb2162daf215f25b9dadf1ea3125), [`5b30da7`](https://github.com/withplumix/plumix/commit/5b30da79f79563e1578bc940f46fd26836570287), [`3a7c64a`](https://github.com/withplumix/plumix/commit/3a7c64a56238e148af7088f28e447acca9b4ab79), [`f5d786a`](https://github.com/withplumix/plumix/commit/f5d786ad6fa0341e6c72c12f011ada40204470fc), [`2a81bf2`](https://github.com/withplumix/plumix/commit/2a81bf24a2d163e8cc3965770ed9bdae9afd5a2e), [`1c67995`](https://github.com/withplumix/plumix/commit/1c67995236f52b0c01a3594d7eab3746191cac5d), [`ce79cc1`](https://github.com/withplumix/plumix/commit/ce79cc17a931bcd5809bad80c71ebcaaed473cd2), [`d4f1001`](https://github.com/withplumix/plumix/commit/d4f10014d60ec42ee40afbe12217b6e0cd810690), [`e581fcf`](https://github.com/withplumix/plumix/commit/e581fcf310170f9a12f6dd264879c851ef08b0d1), [`0390823`](https://github.com/withplumix/plumix/commit/0390823543fb23edf83c8df54671cb7933c9a51f), [`86deb49`](https://github.com/withplumix/plumix/commit/86deb49d04e398de9ded95844ace7a8594d254bd), [`9950906`](https://github.com/withplumix/plumix/commit/9950906203c3174ff99e9fe48f196b64754b1fb8), [`c5945d4`](https://github.com/withplumix/plumix/commit/c5945d4e055b53d546aa87a9bdf4f9c0e9384f91), [`d3c61bf`](https://github.com/withplumix/plumix/commit/d3c61bfa26d2a9cd1b02a4d61a912148e414189b), [`107724d`](https://github.com/withplumix/plumix/commit/107724d272cf534946443eb567848949c4ca3eaa)]:
  - @plumix/core@0.17.0
  - @plumix/blocks@0.17.0
  - @plumix/admin-ui@0.17.0

## 0.16.0

### Patch Changes

- [#1931](https://github.com/withplumix/plumix/pull/1931) [`6cc8e74`](https://github.com/withplumix/plumix/commit/6cc8e742f4ac44bc06a44cdc440e2852f7124900) Thanks [@nasyrov](https://github.com/nasyrov)! - Wires `blocks.htmlAllowlist` through to the renderer. All four of its fields — `extraTags`,
  `extraAttributes`, `schemes`, `allowProtocolRelative` — now change what `core/html` and
  `core/rich-text` render, on the public page and in the editor canvas.

  The allowlist was typed, documented, and built at boot, but nothing mounted `HtmlAllowlistProvider`,
  so every render fell back to the context default — the baseline. Setting
  `htmlAllowlist: { extraTags: ["img"] }` produced silence, not an image.

  `HtmlAllowlistProvider` is the seam, mounted in both consumers. The public render mounts it from
  `renderEnv.htmlAllowlist`, alongside the existing `PlumixProvider`. The editor canvas is a fresh
  React tree inside an iframe with no server context, so the allowlist crosses the boundary the way
  tokens and breakpoints already did: on the JSON embed the SSR emits next to the mount root, read back
  at mount. Without that second mount the canvas would keep sanitizing against the baseline while the
  published page used the operator's list, and an author would see their markup stripped in the editor
  and intact on the site.

  That embed is now `[data-plumix-render-env]` rather than `[data-plumix-style-env]` — it carries more
  than styles. Nothing outside the editor runtime reads it, and the SSR and the runtime that reads it
  ship together.

  This lands alongside the three floor changesets in the same release: the denials in
  `enforceHtmlFloors` are what an override cannot widen past, and they went in before anything could
  reach the renderer through them.

  `PlumixApp.htmlAllowlist` documented the missing step as `<EntryContent htmlAllowlist={...}>`.
  `EntryContent` is an interface, not a component, so that seam never existed and could not be
  followed; the field now describes the provider.

- Updated dependencies [[`2f70692`](https://github.com/withplumix/plumix/commit/2f70692410fc65a66e843a4db33170c1ad954dc1), [`b2b6510`](https://github.com/withplumix/plumix/commit/b2b6510460703249f17dcd0ba676dab3b7ef2caa), [`9927a8f`](https://github.com/withplumix/plumix/commit/9927a8f7e1470a5f6bef1e5517545e3250d91feb), [`1a475b5`](https://github.com/withplumix/plumix/commit/1a475b599314a315a850832fd59f0cedec22e675), [`1b97c01`](https://github.com/withplumix/plumix/commit/1b97c01a99828538110e1cefd60dbcff3828c92f), [`6cc8e74`](https://github.com/withplumix/plumix/commit/6cc8e742f4ac44bc06a44cdc440e2852f7124900), [`f9b705f`](https://github.com/withplumix/plumix/commit/f9b705f4e423aea61cbdb13e9c2b3ca86a544257), [`efe3834`](https://github.com/withplumix/plumix/commit/efe3834bebb073105d6912152091627cce700a63), [`9cf71d9`](https://github.com/withplumix/plumix/commit/9cf71d92e67aa95635a06cfef8e019bb6fab603d)]:
  - @plumix/blocks@0.16.0
  - @plumix/core@0.16.0
  - @plumix/admin-ui@0.16.0

## 0.15.0

### Minor Changes

- [#1897](https://github.com/withplumix/plumix/pull/1897) [`5fbb8cf`](https://github.com/withplumix/plumix/commit/5fbb8cf6faa061554f32c4f3ca490be03449a3d4) Thanks [@nasyrov](https://github.com/nasyrov)! - Types the stored block tree and the plugin dictionaries that describe serialized data with the public `JsonObject` / `JsonValue` types.

  **Source-breaking for block and theme authors** on the type level only — the emitted JS is unchanged. `BlockNode` is now a `type` alias rather than an `interface`, and its `attrs` is a `JsonObject`; the same goes for `BlockVariation.attrs`, `BlockSpec.defaults`, a transform's `mapAttrs`, a block loader's `attrs`, and `ResponsiveStyleSlot` / `VisibilityFlags`. A node built from a `Record<string, unknown>` no longer assigns, and an entry added to `BlockTypeRegistry` has to be spelled as a `type` over an object literal — TypeScript withholds the implicit index signature an `interface` would need.

  What a block's `render` receives is deliberately _not_ JSON and is now named and exported: `MaterializedAttrs` is the stored bag with each slot key replaced by the component that renders that slot's children. `BlockNodeRenderProps`, `BlockNodeComponent` and `BlockSpec` default their `Attrs` parameter to it.

  **Source-breaking for the editor's plugin-field seam.** `@plumix/admin-editor`'s `PluginFieldControlProps` now types `rhf.onChange` as `(next: JsonValue) => void` and the sibling block `attrs` as a `JsonObject`; `rhf.value` stays `unknown`, because the same controls also serve metaboxes, where RHF hands over a live `Date` for a temporal field. The `registerPluginFieldType` registry contract itself is unchanged.

  `@plumix/plugin-audit-log` holds a caller's own `properties` to JSON: `ctx.audit.log({ properties })` and an event definition's `extra` return no longer accept a `Date`, which reached storage as an ISO string anyway. The row's stored envelope stays open — its diff half is built from live entity columns.

  Island props keep their open type — the prop codec encodes `Date`, `Map`, `Set`, `BigInt`, `URL` and the typed arrays so they survive hydration, which a JSON type would deny.

  `@plumix/runtime-cloudflare` types the CF Access JWT payload as jose's `JWTPayload` instead of a loose dictionary.

### Patch Changes

- Updated dependencies [[`c0771f0`](https://github.com/withplumix/plumix/commit/c0771f010290452887f758483a25a2e303dbf346), [`5fbb8cf`](https://github.com/withplumix/plumix/commit/5fbb8cf6faa061554f32c4f3ca490be03449a3d4), [`b39380a`](https://github.com/withplumix/plumix/commit/b39380a7dab2780ec1f36729328258b529b85800), [`82fa032`](https://github.com/withplumix/plumix/commit/82fa0323aada1c0c37e17261a4d2c62f7b585584), [`064ff07`](https://github.com/withplumix/plumix/commit/064ff07cbf36728beb2afcfcddfe82f0fd36f193), [`cfae716`](https://github.com/withplumix/plumix/commit/cfae716b9a39873db45ccb79083f4e1753e14744), [`e5d9d6b`](https://github.com/withplumix/plumix/commit/e5d9d6bef5b901206a3fd4f9a68d84b9edadb4ef), [`482b4e6`](https://github.com/withplumix/plumix/commit/482b4e697cbf6b2f014e712315050f474f502fe0), [`b014e4d`](https://github.com/withplumix/plumix/commit/b014e4d212f1ccde8af3dd1464a1fea4143b97f9), [`fdd72b8`](https://github.com/withplumix/plumix/commit/fdd72b89167237d25bc3ced465e0d2543c37b40b), [`b6dcb7f`](https://github.com/withplumix/plumix/commit/b6dcb7f0a507dd1989e0ca3b86b0fb16927487f0), [`5a24bfc`](https://github.com/withplumix/plumix/commit/5a24bfcd445c2cf1b89224f5ec07f4fef1080c57)]:
  - @plumix/core@0.15.0
  - @plumix/blocks@0.15.0
  - @plumix/admin-ui@0.15.0

## 0.14.0

### Patch Changes

- Updated dependencies [[`7c7be38`](https://github.com/withplumix/plumix/commit/7c7be38e813530a3e27dd7d34df509470b5d1280), [`56cdc6f`](https://github.com/withplumix/plumix/commit/56cdc6f616413c4d20be9a3cccff303259cae1ac), [`4155a46`](https://github.com/withplumix/plumix/commit/4155a467dcd5e358d3c335849943e7683fc804cd), [`f579afb`](https://github.com/withplumix/plumix/commit/f579afbbf0e297b1c591d23a2c3b20c178880bc6), [`320f222`](https://github.com/withplumix/plumix/commit/320f222c5b365079a8f618b1955dbb2e59bd37d8)]:
  - @plumix/core@0.14.0
  - @plumix/blocks@0.14.0
  - @plumix/admin-ui@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [[`f3971a8`](https://github.com/withplumix/plumix/commit/f3971a8ec726a12ab7aa2e0c2897d48f3d5c4889), [`6d6db5c`](https://github.com/withplumix/plumix/commit/6d6db5c6a2defabfc0737f570f4d30a40c7ee67d), [`4f5730d`](https://github.com/withplumix/plumix/commit/4f5730dcaecb587396c41f7c10229f3689de52c8), [`dcda2fa`](https://github.com/withplumix/plumix/commit/dcda2fa124117175f5a56f587c22e95d6f14d89e), [`202a1fc`](https://github.com/withplumix/plumix/commit/202a1fc788e5386c08ba6c9d69bbba49c3503fc6), [`c01d2a3`](https://github.com/withplumix/plumix/commit/c01d2a3f843cdf743ba2f4cc5812c245cb9d918d)]:
  - @plumix/core@0.13.0
  - @plumix/blocks@0.13.0
  - @plumix/admin-ui@0.13.0

## 0.12.0

### Minor Changes

- [#1730](https://github.com/withplumix/plumix/pull/1730) [`fff6e4a`](https://github.com/withplumix/plumix/commit/fff6e4a134e03a6fa1276c8d0d3d23c8cd7e134a) Thanks [@nasyrov](https://github.com/nasyrov)! - Add optional per-entry-type scoping for editor blocks.

  Blocks registered via `ctx.registerBlock` were global — offered in every entry
  type's inserter — and the only lever was `inserter: false`, which hides a block
  from _every_ palette. There was no way to offer a block for one entry type and
  nowhere else.

  A block spec can now declare an optional `entryTypes` allow-list:

  ```ts
  defineBlock({ name: "eduscope/hero", entryTypes: ["school"], render });
  ```

  Unset = every type (the unchanged default, so nothing changes for existing
  blocks); set = the block appears only in those entry types' inserters, and is
  hidden when the entry type doesn't match or is unknown. This mirrors the existing
  `PatternSpec.entryTypes` scoping. It constrains only the editor's
  available-blocks palette — the render registry stays global and save-time
  validation is untouched, so a block already stored on an entry still renders and
  still validates regardless of the type it lives on.

### Patch Changes

- Updated dependencies [[`c5facfe`](https://github.com/withplumix/plumix/commit/c5facfee050d3f5880de31dc6866dd48c4ac3d41), [`665a57b`](https://github.com/withplumix/plumix/commit/665a57b421fc2f82dcf0dad7d0a89e2497557959), [`c74ca2f`](https://github.com/withplumix/plumix/commit/c74ca2ffc069209d543e5d606a2ded8b22245a1e), [`b124789`](https://github.com/withplumix/plumix/commit/b1247897f2044ad4e7f975ce2d0b8294fd0939af), [`30f287e`](https://github.com/withplumix/plumix/commit/30f287e72470efd50ce4e95183c4f7e89f8e0843), [`88b6db2`](https://github.com/withplumix/plumix/commit/88b6db2b94c94a0a9c12f4d8cb84289f28cd7558), [`6da618c`](https://github.com/withplumix/plumix/commit/6da618c216924fa966cb735ef33c16451383b4b0), [`56e416a`](https://github.com/withplumix/plumix/commit/56e416af8e753cc07cd0f87a26af4ef0c6fc343c), [`05ea95c`](https://github.com/withplumix/plumix/commit/05ea95c65a798ea2b74b7b3f3f533471aa4a483e), [`66bce99`](https://github.com/withplumix/plumix/commit/66bce99343595168a13272b947cebb074aa30650), [`fff6e4a`](https://github.com/withplumix/plumix/commit/fff6e4a134e03a6fa1276c8d0d3d23c8cd7e134a), [`5785f19`](https://github.com/withplumix/plumix/commit/5785f19862495b1c445640fbc58a3210d6b0c2ff)]:
  - @plumix/core@0.12.0
  - @plumix/blocks@0.12.0
  - @plumix/admin-ui@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies [[`77ef988`](https://github.com/withplumix/plumix/commit/77ef988411eed32144bd4d5fabcc497fbbbac9ef), [`168466a`](https://github.com/withplumix/plumix/commit/168466a3e473a81ce77c0acff6678bbeac1dea9b)]:
  - @plumix/blocks@0.11.0
  - @plumix/core@0.11.0
  - @plumix/admin-ui@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [[`5743bfc`](https://github.com/withplumix/plumix/commit/5743bfc95516d55c67d633f4b61a4c9a1e092f8d)]:
  - @plumix/blocks@0.10.0
  - @plumix/core@0.10.0
  - @plumix/admin-ui@0.10.0

## 0.9.0

### Patch Changes

- Updated dependencies [[`24d9639`](https://github.com/withplumix/plumix/commit/24d96390631893c788b54fe6261c781ad798969c), [`09e89b8`](https://github.com/withplumix/plumix/commit/09e89b88a7e8cbabe96baf7413c3c38149db905e), [`36ce243`](https://github.com/withplumix/plumix/commit/36ce24381eee89688b18cd77255bb9fb29429407), [`2d6753a`](https://github.com/withplumix/plumix/commit/2d6753a26e55df944bc194564190990db1b775ec), [`c16b2bc`](https://github.com/withplumix/plumix/commit/c16b2bcc112c82459a090a5e59fe263ee55ff658), [`a9f5648`](https://github.com/withplumix/plumix/commit/a9f56484cb25875cd895538018139a706dc2ba80)]:
  - @plumix/core@0.9.0
  - @plumix/blocks@0.9.0
  - @plumix/admin-ui@0.9.0

## 0.8.0

### Patch Changes

- [#1557](https://github.com/withplumix/plumix/pull/1557) [`4481cf2`](https://github.com/withplumix/plumix/commit/4481cf28a6b9feef66ddc4f002a2b1bdea9ab725) Thanks [@nasyrov](https://github.com/nasyrov)! - Reflect title, excerpt, meta, and template edits in the editor's visual canvas.

  The canvas iframe live-synced only block content over its bridge; the entry
  fields the theme template renders around the blocks — title, excerpt, meta,
  and a `named`-template pick — stayed at their load-time server render until a
  manual reload. Now, after such a field autosaves, the host reloads the canvas
  (debounced, coalescing a burst of edits into one reload; block content and the
  scroll position are preserved), so the theme output tracks the edit.

  Two paths fed the stale output, both fixed:

  - The host never signaled the canvas to refresh for these fields. `PlumixEditor`
    gains a `previewRefreshToken` the editor bumps after a title / excerpt / meta /
    template autosave; `CanvasFrame` reloads the iframe when it changes.
  - The `?preview=` render itself froze the title. `overlayPreviewAutosave` copied
    `title` from the autosave snapshot, overriding a later live title edit — but
    the title is a live field (written with `saveAs: "live"`, like slug / parent /
    terms, which already came from the live row). The preview now overlays only
    the drafted fields (content, excerpt, meta) and reads the title from live.

- [#1607](https://github.com/withplumix/plumix/pull/1607) [`5beb3ce`](https://github.com/withplumix/plumix/commit/5beb3ced84758f4255356f1118442a45ecaa01b6) Thanks [@nasyrov](https://github.com/nasyrov)! - Reintroduce the starter picker for empty entries.

  The Puck-removal refactor ([#1143](https://github.com/withplumix/plumix/issues/1143)) dropped the "Pick a starter…" onboarding shown
  when authoring a blank entry, so new entries opened onto an empty canvas with no
  offered starting points — even though the pattern data layer still marked
  starter-eligible patterns (`target: "post-content"`, optional `entryTypes`,
  `priority`). The bespoke editor now surfaces them again:

  - `PlumixEditor` takes an `entryType` and, for a blank entry, opens a modal of
    the eligible starter patterns (ordered by priority) plus a "Start from blank"
    escape. Choosing one seeds the canvas with the pattern's blocks (fresh ids, a
    single undoable step); the editor stays empty on "Start from blank".
  - A toolbar "Pick a starter…" button re-summons the picker while the canvas is
    still empty, so a dismissal isn't final.

  Starter open state lives in the editor store; the read-only revision preview
  omits the picker.

- [#1605](https://github.com/withplumix/plumix/pull/1605) [`154e9e4`](https://github.com/withplumix/plumix/commit/154e9e44c538a8a89056f6be6c5e6fbb1d305c36) Thanks [@nasyrov](https://github.com/nasyrov)! - Restore the browse-revision-history button in the visual editor.

  The Puck-removal refactor ([#1143](https://github.com/withplumix/plumix/issues/1143)) left the bespoke `PlumixEditor` header with no
  slot for the revision-history affordance, so `edit.tsx` stopped wiring it for the
  visual branch — revision history became reachable only by hand-crafting a
  `?revision=<id>` URL. `PlumixEditor` (and its header) now take an optional
  `revisionsTrigger` slot, rendered as a history icon just after undo/redo, and the
  visual editor route wires `useRevisionsTrigger` into it — mirroring the plain-form
  editor (which keeps its labelled text button via the sheet's `triggerVariant`).
  The sheet's orpc calls stay in the app; the package only exposes the slot.

- Updated dependencies [[`976fc4d`](https://github.com/withplumix/plumix/commit/976fc4dc102529c25c6509da89e6bce151945dd5), [`4481cf2`](https://github.com/withplumix/plumix/commit/4481cf28a6b9feef66ddc4f002a2b1bdea9ab725), [`077c515`](https://github.com/withplumix/plumix/commit/077c515e47d3e807d61b5ed4a0ff7cbc94839eff), [`741c6b4`](https://github.com/withplumix/plumix/commit/741c6b4b0c731e3fe8efd1c316a0ea4fd23b6e0d), [`ec117ea`](https://github.com/withplumix/plumix/commit/ec117ea45ed6ff064807ae2d6cee4dfb5b67cf35), [`9a1e88a`](https://github.com/withplumix/plumix/commit/9a1e88adb272f1f4795ddfd23e2958b4aa8b9443), [`6fe5583`](https://github.com/withplumix/plumix/commit/6fe5583954947ba11093fb053c946640b703b4b0), [`3d269a3`](https://github.com/withplumix/plumix/commit/3d269a399f6e36e499ef60846abe02716103d7a0), [`112e1bd`](https://github.com/withplumix/plumix/commit/112e1bd6d0ab8f9579ef8a87651d3a996faf75b9), [`a5be41a`](https://github.com/withplumix/plumix/commit/a5be41a282fc4785c7cec582af0e97b3d99bed8a), [`f379b46`](https://github.com/withplumix/plumix/commit/f379b46b4c863bde6d4235a5753e7fd07926153c), [`5beb3ce`](https://github.com/withplumix/plumix/commit/5beb3ced84758f4255356f1118442a45ecaa01b6), [`154e9e4`](https://github.com/withplumix/plumix/commit/154e9e44c538a8a89056f6be6c5e6fbb1d305c36)]:
  - @plumix/blocks@0.8.0
  - @plumix/core@0.8.0
  - @plumix/admin-ui@0.8.0

## 0.7.0

### Minor Changes

- [#1548](https://github.com/withplumix/plumix/pull/1548) [`538d64d`](https://github.com/withplumix/plumix/commit/538d64d4cf0767f4302e3287ebb8c1b752105027) Thanks [@nasyrov](https://github.com/nasyrov)! - Render the metabox `richtext()` field as a real Tiptap editor instead of a raw-JSON textarea.

  The block editor's rich-text editor is now shared: it gained a JSON serialization mode (reads/writes the ProseMirror doc the field stores) and an optional marks/nodes allowlist that constrains both the editor schema and the toolbar, so a field authored with `.marks(["bold","link"]).nodes(["heading"])` only offers — and can only produce — the formatting it declares. The block editor's own usage is unchanged (HTML serialization and the full toolbar remain its defaults). The editor is code-split, so forms without a richtext field never load the ProseMirror chunk.

  Also fixes the server-side richtext validator to implicitly allow `hardBreak` and `listItem`: the shared editor always ships a Shift+Enter line break, and any allowed list carries list items, so a natural `.nodes(["bulletList"])` field could previously produce content its own editor offered but the server then rejected on save.

### Patch Changes

- Updated dependencies [[`7d5d664`](https://github.com/withplumix/plumix/commit/7d5d664dca8c1fb726b9fc7f1607b3ad41d26708), [`b7f3810`](https://github.com/withplumix/plumix/commit/b7f3810be8e72ba44d05f74fb663dec3c6cb906a), [`4f5b96a`](https://github.com/withplumix/plumix/commit/4f5b96aeebd75f0dde824fbe763fe7c040094c9c), [`40d4221`](https://github.com/withplumix/plumix/commit/40d4221e6f880e7bc653ff948adc339f06a78d4b), [`864aa9a`](https://github.com/withplumix/plumix/commit/864aa9aef5dc3b950c3a65057cb65b9b88e3a797), [`3171824`](https://github.com/withplumix/plumix/commit/3171824efeebd85a89ae2edcac86c7a379cc8b5f), [`1501f42`](https://github.com/withplumix/plumix/commit/1501f42f2431290f5ecdfbe35035948c90733511), [`c067480`](https://github.com/withplumix/plumix/commit/c067480cb8ecb70d1be2a0ad6f26634bd919a2fd), [`274a97c`](https://github.com/withplumix/plumix/commit/274a97c0c239ba1722965b00620e1ad91b54ef90), [`9087ed0`](https://github.com/withplumix/plumix/commit/9087ed0c9dfc720b5b3b135691bade4a9afbe28d), [`4617ca9`](https://github.com/withplumix/plumix/commit/4617ca9b66873d4c83debe78f8d7f2a3b58e2479), [`f58edfb`](https://github.com/withplumix/plumix/commit/f58edfbfa4d743ec41143366da219160cfc3e9fb), [`63afd4f`](https://github.com/withplumix/plumix/commit/63afd4f2a3f5e8197ba26b9145b75e52a548b61b), [`011174b`](https://github.com/withplumix/plumix/commit/011174b37b3015b033191e72426c5b7849c33df2), [`0a185ba`](https://github.com/withplumix/plumix/commit/0a185baf413211727c36971e8880c2a670bede6d), [`538d64d`](https://github.com/withplumix/plumix/commit/538d64d4cf0767f4302e3287ebb8c1b752105027), [`3df62e3`](https://github.com/withplumix/plumix/commit/3df62e300348aa90bb8b4a9fd1883adf8e5c03ee), [`a55a17c`](https://github.com/withplumix/plumix/commit/a55a17cfb577b8e5f21b428496bd2a0d76b9fffd), [`e9a14b1`](https://github.com/withplumix/plumix/commit/e9a14b18460915e8aa210047d63f5d6097b3b24a)]:
  - @plumix/core@0.7.0
  - @plumix/admin-ui@0.7.0
  - @plumix/blocks@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [[`f737d54`](https://github.com/withplumix/plumix/commit/f737d54854c422ad564c98649b58c2a259f8322b), [`642dcf6`](https://github.com/withplumix/plumix/commit/642dcf6b2cd42e4f9aca5ddf007dc3f6b1f7f613), [`d6c456a`](https://github.com/withplumix/plumix/commit/d6c456a6bf365f492a7024bf7a83da77d006b8d7), [`4c9205a`](https://github.com/withplumix/plumix/commit/4c9205a8dfadfd9b54983b032e234bf4c7ab9ec8), [`dad17a3`](https://github.com/withplumix/plumix/commit/dad17a3f71a8881b5b5ed1dbd387c0f8d2aa520e), [`bcd76ed`](https://github.com/withplumix/plumix/commit/bcd76ed4240f30daa79a2a421d042d2afb6f9aa3), [`902a922`](https://github.com/withplumix/plumix/commit/902a922b8dc5652700cc9cbbb8f00726b34a482c), [`75ef282`](https://github.com/withplumix/plumix/commit/75ef282365fc02cf9520494e3f757cf5a6879880), [`af1af74`](https://github.com/withplumix/plumix/commit/af1af74a925ea4ba5f8ab1c153a466a13195ad68)]:
  - @plumix/core@0.6.0
  - @plumix/blocks@0.6.0
  - @plumix/admin-ui@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [[`7ddd056`](https://github.com/withplumix/plumix/commit/7ddd056a28538719094263c21c4476ec0e203aa5), [`ff1d101`](https://github.com/withplumix/plumix/commit/ff1d1011486e4de0a97c29acd1de33330299dd6f), [`a69b39e`](https://github.com/withplumix/plumix/commit/a69b39e2d909f21cb59c287e4a3e90f83e1e9392), [`b3ad524`](https://github.com/withplumix/plumix/commit/b3ad5247e8dcfd6c2adaeb03f0e22c8a5b5e530d), [`7455fa6`](https://github.com/withplumix/plumix/commit/7455fa68660a5f9ad85e8c6d5a728c747990289c), [`5776069`](https://github.com/withplumix/plumix/commit/5776069d17ae9370c4a82c13f57150dfdf409009)]:
  - @plumix/core@0.5.0
  - @plumix/blocks@0.5.0
  - @plumix/admin-ui@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [[`47ec8e2`](https://github.com/withplumix/plumix/commit/47ec8e293dc3c0dd54da34c63c449182a302745e), [`e96e27d`](https://github.com/withplumix/plumix/commit/e96e27d5b6e378fb049431871386c7dcc643bff1), [`0ad5a4b`](https://github.com/withplumix/plumix/commit/0ad5a4bd85c8a57b2fe4cc6bc8803795775c6140), [`39b02e8`](https://github.com/withplumix/plumix/commit/39b02e8595e2d28291014d47bfa8f65d16f976f2)]:
  - @plumix/core@0.4.0
  - @plumix/blocks@0.4.0
  - @plumix/admin-ui@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [[`4cdb59e`](https://github.com/withplumix/plumix/commit/4cdb59ed70c2d83d5b1461a754970709cba92910)]:
  - @plumix/core@0.3.0
  - @plumix/blocks@0.3.0
  - @plumix/admin-ui@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [[`1ff209a`](https://github.com/withplumix/plumix/commit/1ff209a56b1ed3d78e8a6eedb73ceaec056b588d)]:
  - @plumix/core@0.2.0
  - @plumix/blocks@0.2.0
  - @plumix/admin-ui@0.2.0

## 0.1.4

### Patch Changes

- Updated dependencies [[`9467449`](https://github.com/withplumix/plumix/commit/9467449d397f65ede387c83883f46c0f3064cc2f)]:
  - @plumix/core@0.1.4
  - @plumix/blocks@0.1.4
  - @plumix/admin-ui@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies [[`c37b6db`](https://github.com/withplumix/plumix/commit/c37b6dba1913322aabc85e9b2876b433efe73351), [`17658a5`](https://github.com/withplumix/plumix/commit/17658a53b3fb2f5135527a6f6a195f8c5aa49756)]:
  - @plumix/core@0.1.3
  - @plumix/blocks@0.1.3
  - @plumix/admin-ui@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies [[`b493fbb`](https://github.com/withplumix/plumix/commit/b493fbb4b3cefec54322ea54023129b4ce1d1139)]:
  - @plumix/core@0.1.2
  - @plumix/blocks@0.1.2
  - @plumix/admin-ui@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [[`843a184`](https://github.com/withplumix/plumix/commit/843a184ea755722f5b9d83664574eaf6ada97045)]:
  - @plumix/core@0.1.1
  - @plumix/blocks@0.1.1
  - @plumix/admin-ui@0.1.1
