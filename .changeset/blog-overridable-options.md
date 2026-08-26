---
"@plumix/plugin-blog": minor
---

`blog` is now a factory that accepts a per-registration override, so a site can move the post type off `/posts`, give it an archive, retitle it, or skip a taxonomy without forking the plugin.

Each of `post`, `category` and `tag` takes a partial of the options the plugin passes to `registerEntryType` / `registerTermTaxonomy`; object-valued options merge key by key, arrays replace or compose via `(prev) => next`, and `false` skips the registration. `relatedPosts` takes a `limit` or `false`.

Breaking: `blog` must now be called. Update `plugins: [blog]` to `plugins: [blog()]`.
