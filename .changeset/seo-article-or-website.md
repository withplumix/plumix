---
"@plumix/plugin-seo": minor
---

Fixes pages carrying `article:*` tags beside an `og:type` of `website`. Each page now resolves to one kind, article or website, and its `og:type`, its `article:*` tags and its JSON-LD Article piece all follow it. A template's own `og:type` wins, then the editor's new **Web page** choice or Article subtype in the SEO box's Content type, then the entry type's `seoType`. Pages and other hierarchical types now render as `website` with no article tags. Set `seoType: "article"` when registering such a type to make it an article again, or `seoType: "website"` on a flat type to opt it out. `article:author` is now the author archive's absolute URL rather than the author's name, and is left out when the author route is off. The JSON-LD `Person` gains the same `url`.
