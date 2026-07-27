# @plumix/admin-editor

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
