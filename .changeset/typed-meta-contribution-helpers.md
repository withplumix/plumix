---
"@plumix/core": minor
---

Add `EntryMeta` / `TermMeta` / `UserMeta` / `SettingsMeta` helper types for
declaring typed-meta contributions. Instead of hand-writing the contribution
shape, plugin authors write:

```ts
import type { EntryMeta } from "plumix";

declare module "plumix" {
  interface EntryMetaContributions {
    article: EntryMeta<"post", typeof articleFields>;
  }
}
```

The helpers fold identically to the raw `{ entryTypes; fields }` object but
remove a silent-failure footgun — misspelling `entryTypes` left the
contribution structurally valid yet unmatched by the read-type fold, so the
fields read as absent with no error. The target-name generic is also
constrained to registered entry types / taxonomies, surfacing an unknown
target at the declaration itself. `EntryMeta`'s JSDoc carries the end-to-end
walkthrough from declaring fields to typed `forEntryType(...).template(...)`
reads.
