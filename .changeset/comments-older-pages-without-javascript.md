---
"@plumix/plugin-comments": minor
---

Adds older comment pages that work without JavaScript. The `comments` template dep renders the page an entry URL's `?comments=<cursor>` names and resolves to a `ResolvedThreadPage` whose `olderHref` and `newestHref` link the pages; a malformed cursor answers a 301 to the entry. Adds `PlumixCommentThread` to `@plumix/plugin-comments/theme`, which renders the thread with plain Older and Newest comments links and loads older comments inline once JavaScript runs. Requires `plumix` 0.25.0 or later.
