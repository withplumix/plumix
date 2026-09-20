---
"@plumix/plugin-og": minor
---

Adds a font declaration to `CardRenderer`: a renderer now says which font formats it reads beside the content type it writes, and the plugin fetches — and digests — only the faces that renderer will actually receive.

`remote()` declares that it reads no fonts, so a site rendering off-box no longer reads its font set on every card, and now serves cards on a runtime that exposes no asset layer at all. An endpoint that wants the site's own faces takes them with `remote({ url, fonts: { formats: ["woff2"] } })`, base64 in the request body.

Three things to expect on upgrade, all of them one-time.

Cards re-digest — so each is re-rendered at a new URL and its predecessor is left in the bucket — on any site where the connected renderer does not read the whole configured font set. That covers a renderer reading no fonts at all, and it also covers a mixed set such as `["/fonts/Inter.woff2", "/fonts/Inter.ttf"]` against the bundled engine, where the WOFF2 face was always dead weight and now leaves the digest with the rest of the render untouched.

A site configuring _only_ paths the renderer cannot read ships textless cards today. That now fails with an error naming both the formats the renderer reads and the faces turned away, because which formats can be read is the renderer's business and the bundled engine cannot read WOFF2 — what most font packages ship.

A path carrying no file extension is read by no renderer, since the format is named by the path and there is nothing else to read before a face is fetched.
