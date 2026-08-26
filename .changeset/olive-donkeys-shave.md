---
"@plumix/plugin-og": minor
"@plumix/core": minor
---

Emits generated cards into the page head.

An entry's page now carries its card as `og:image`, with `og:image:width` and `og:image:height` alongside it, so a scraper lays the preview out before it fetches the bytes. The size comes off the card rule the route would resolve, so a theme card declaring its own dimensions is reported at those. The card sits one link below an author's own `.ogImage()` / `.featured()` choice and one above `site.default_og_image`: it beats a generic image and never overrides a deliberate one.

Cards are PNG by default — around 27 KB for a representative card — with `takumi({ format: "jpeg" })` for a photo-heavy design. The route's extension always names the format behind it.

What reaches the head is decided by what the renderer declares it produces, not by a flag of its own. `svgOnly()` still serves its route, so you can build and look at cards with no rasterizer, but SVG is never advertised: it unfurls as nothing on X, Facebook and LinkedIn, which is worse than your site's default. A render that throws redirects to that same default and logs, rather than answering an error status the head already promised an image for — and in development it surfaces on the dev error page with its stack.

Core change behind that last part: a throw from anything mounted under `/_plumix/` — a plugin route above all — now reaches the dev error page in development, where it previously returned an opaque `internal_error` JSON body. Production is unchanged.
