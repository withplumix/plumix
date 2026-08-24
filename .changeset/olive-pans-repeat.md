---
"@plumix/blocks": patch
---

Moves the raw-HTML floors from `buildHtmlAllowlist` into `sanitizeHtml`, so they hold for any
allowlist that reaches the renderer.

The three floors — denied tags, denied attributes, denied schemes — sat in the builder, which is not
the only way an allowlist arrives. `HtmlAllowlistProvider` and the `HtmlAllowlist` type are both
public, and `core/html` and `core/rich-text` sanitize against whatever the provider carries, so a
theme mounting a hand-built allowlist got no floor at all:

```tsx
<HtmlAllowlistProvider value={{ allowedTags: ["script"], ... }}>
```

`sanitizeHtml` is the one call every render passes through, builder or not, and it now narrows the
allowlist it is handed before either engine sees it. The floors and the pass that applies them live
in `html/floors.ts`, which both sides share.

Canonicalizing moved with them, which is what makes the floor hold rather than merely relocate.
Lowercasing used to happen in the builder, so `allowedTags: ["IFRAME"]` through the provider passed a
denylist keyed on lowercase names — inert under sanitize-html, which lowercases the parsed tag and
matches the list verbatim, but live under the DOMPurify shim, which lowercases its list instead.
`enforceHtmlFloors` now lowercases and dedupes before it filters, and `buildHtmlAllowlist` is left
merging an operator's override and nothing else.

No config behaviour changes: an allowlist that was already clean comes back identical, which the
baseline and everything the builder produces both are.
