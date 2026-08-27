---
"@plumix/plugin-og": minor
---

Completes the `og:image` precedence chain: an explicit `.ogImage()` image, then
the entry's `.featured()` photo cropped to the card's size, then the generated
card, then the site-wide default. The crop is pure URL math through the
`imageDelivery:` slot, so the commonest case of all — a post with a photo —
never reaches the renderer and works on a deploy that cannot rasterize
anything. With no delivery configured the photo is emitted as it stands, at its
own size. A card rule may declare `mode: "card"` to be the share image even on
an entry that has a photo.
