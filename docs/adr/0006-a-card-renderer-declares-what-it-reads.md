# A card renderer declares what it reads, not just what it writes

`@plumix/plugin-og` connects a `CardRenderer`: the bundled wasm engine, its
SVG output, `remote()` against an endpoint, or a site's own. Until #2489 a
renderer declared one thing — the `contentType` it produces — and the plugin
read every configured font face before consulting it at all.

That is wrong for any renderer that does not read fonts. `remote()` posts the
node tree, the size, the stylesheets and the images, and nothing else; the
endpoint brings its own faces. So a site configuring `fonts` and rendering
off-box paid a font read per card for nothing — hundreds of KB a face, several
MB for a CJK face, on every storage miss and every admin preview — and on a
runtime exposing no asset layer, `assetLayerMissing` failed _every_ card,
including the ones that never needed a font.

The same gap had already produced a second, quieter defect. "TTF, OTF and WOFF
are read; WOFF2 is not" was documented on the plugin's `fonts` option and in
the public docs as though it were a fact about the plugin. It is a fact about
the bundled engine. An endpoint on the far side of `remote()` may read WOFF2
perfectly well, and a site was being told otherwise.

> **A renderer declares what it reads beside what it writes, and the plugin
> hands it — and digests — exactly that.**

`CardRenderer.fonts` is a `{ formats }` record, or `false` for a renderer that
reads no fonts, or absent for one written before the declaration existed. The
plugin filters the configured set to the formats declared, and one invariant
carries the rest:

> **The card digest names exactly the fonts the renderer will actually
> receive.**

Every case falls out of it rather than needing a rule. `false` means no read,
no asset layer required, and no fonts digested — a configured set is simply not
addressed to that renderer, so it is a no-op and not an error. A face in an
unparseable format is never fetched and never digested, because it is not an
input to the bytes. And a configured set with nothing the renderer can parse
fails the card, which is the policy the plugin already holds for a face it
cannot read: a card with no text on it must not be served with a 200.

The declaration is safe to trust because trusting it wrongly is cheap. A
renderer that declares `false` and secretly wanted faces receives an empty
list — the documented "engine's own fallback face" path — rather than a crash.

## Considered options

- **Load unconditionally in the caller** (rejected). The status quo, and also
  what `@vercel/og` does: its shipped edge bundle fetches and awaits a fallback
  face at module scope on every render, then discards it whenever the caller
  supplied fonts. Same defect, same shape, in the most widely deployed
  implementation of this idea.

- **Let each renderer acquire its own fonts** (rejected). What `nuxt-og-image`
  does, and it works: its browser renderer never imports the font loader, so no
  renderer conditional exists anywhere in its runtime path. Rejected on two
  counts. It fragments the single font-failure policy this plugin holds
  deliberately — one place decides that a missing face fails the card rather
  than serving a textless one — and it blinds the digest, because the plugin no
  longer knows what the renderer will read. Nuxt pays exactly that price: it
  folds no font data into its cache key, so changing a font family leaves
  cached images stale until a module upgrade or a hand-set `cacheVersion`. It
  also cost them a renderer-named field in their font data model and a
  per-renderer format mapping recorded only in a doc comment.

- **A lazy font thunk on the render input** (rejected). Keeps one acquisition
  path and cannot drift, since a renderer that never calls it pays nothing. But
  it can be introspected neither at boot nor at digest time, and the digest is
  computed before any render. Satori's `loadAdditionalAsset` is the pull-shaped
  precedent and shows the ceiling: it tops up faces for glyphs the engine
  cannot shape, but cannot bootstrap, because the engine is built before the
  hook is consulted.

- **Validate at boot instead of filtering** (rejected). A configured `.woff2`
  against the bundled engine is knowable at startup, so a boot error is
  possible. It crashes a site for temporarily swapping in a renderer, and the
  check is on a filename rather than on content. Filtering reaches the same
  place through the failure policy already written.

## Consequences

Cards re-digest once wherever the connected renderer does not read the whole
configured set: new URLs, one re-render each, and the previous objects left in
the bucket, since nothing deletes a card's predecessor. The loud case is a
renderer that reads no fonts. The quiet one is a mixed set — a WOFF2 face
listed ahead of a TTF fallback against the bundled engine — where the render is
unchanged, nothing errors, and the URLs move anyway because the digest now
names only what the renderer receives. That is the invariant doing its job, but
it is silent, so it belongs in the release notes rather than only here.

A site configuring a WOFF2 path against the bundled engine ships textless cards
today and now fails loudly instead. That is the point — a card with no text on
it is the failure the plugin already refuses one step later — but it turns a
working-looking site into a visibly broken one at upgrade.

Nothing here is a _capability_ in this repo's sense. `CONTEXT.md` reserves that
word for RBAC; a renderer's declaration of what it reads is an input
declaration and nothing more.
