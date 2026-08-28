---
"@plumix/plugin-seo": minor
"@plumix/admin": minor
"plumix": patch
---

Gives the SEO plugin the two surfaces a person actually touches: a live search-result preview in
the editor, and the rest of the settings screen.

**In the editor**, the **Search & social** box on an entry now leads with a preview of the search
result it will produce — the URL, the resolved title and the resolved description, each through the
function the head runs, so the preview cannot show what the page will not carry. It updates as the
author types, because the search title, the search description and the **Hide from search engines**
toggle are read off the live form rather than off the saved row. Two length indicators track the
resolved lines against 60 characters for the title and 155 for the description and say when one
will be cut short. When the page is not offered to search engines the preview names the assertion
that fired — the whole site, this entry, the content type, the taxonomy, a search-results page,
page two of an archive, a page that was not found — which is what the reason string on the
indexability predicate was built to carry. A term's box has no preview: it is written from an
entry's permalink and excerpt, and a term archive has neither.

The preview is a registered field type, so it reaches the editor through the plugin's own admin
chunk. That is also why it is the one part of the plugin with Playwright coverage: the dispatcher
harness cannot render a React control.

**In settings**, the **SEO** page now composes three groups rather than one, each with its own Save
and each gated by `settings:manage`:

- **Search & social** — everything the site answers about its own content, as before.
- **Site verification** — Google, Bing, Yandex, Baidu and Pinterest tokens, each reaching the head
  of every page under the meta name that engine reads.
- **robots.txt** — hand-written content replacing the generated _rules_, so a rule can change
  without a deploy. The two site-wide answers compose around it rather than being replaced by it: a
  site with indexing turned off still disallows everything whatever the box holds, the AI-crawler
  group is still added while that toggle is on, and the `Sitemap:` line is still appended unless the
  author wrote one. The generated body carries that line too, which it did not before.

Saving any of the three now purges the cached sitemap set _and_ the cached content pages of every
registered entry type. Between them these groups rewrite a page's robots directive, title and
verification tags, and the shipped cache has no site-wide tag to retire them by.

`@plumix/admin` gains one thing on the plugin field-renderer contract: `siblings`, the other values
in the bag the field's box binds to, as react-hook-form holds them. A control that describes the
fields around it had no way to see them — `attrs` covers the block inspector only. Only the plugin
branch subscribes, so a box of built-in inputs still re-renders one field per keystroke; a plugin
control on an entry does re-render on any meta edit, since `meta` is one bag shared by every box on
the entity.

One bug fix comes with it. `plumix` builds the admin manifest at config time and never fired
`theme:ready`, so anything a plugin registers from that handover was in the running worker's
registry and missing from the admin's — which covered the SEO meta box and, since the settings
groups moved there too, the whole SEO settings page. The manifest build now makes the same handover
`buildApp` does.
