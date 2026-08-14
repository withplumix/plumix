---
"@plumix/core": minor
---

Let editors set per-entry visibility, choosing from the policies a type declares.

An entry type can offer a closed set of selectable access policies beside its
default, and an editor assigns one to an individual entry from the document
settings — no code change per entry. Precedence is per-entry › entry-type ›
global, so a single article can be members-only even when its type is public.

```ts
ctx.registerEntryType("article", {
  access: {
    default: anonymousPolicy, // public by default…
    policies: [
      // …but an editor may lock an individual entry to members.
      { key: "members", label: "Members only", policy: authenticatedPolicy },
    ],
  },
});
```

The choice persists on the entry and drives both the hard gate and the segment
the edge cache keys on. An editor can only pick a policy the developer declared
(`entry.update` validates the key server-side), and a type that declares no
selectable policies pays no extra lookup — the hot path is unchanged. A
would-be-404 falls back to the type default, so gating never leaks which slugs
exist, and a stale selection (a policy the developer removed) falls back to the
default rather than granting less.

This completes the theme-facing access-control model: policies now attach at the
global, entry-type, and per-entry levels.
