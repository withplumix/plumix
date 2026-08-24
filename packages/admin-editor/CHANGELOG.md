# @plumix/admin-editor

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
