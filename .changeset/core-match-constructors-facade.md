---
"@plumix/core": minor
"plumix": minor
---

Publishes `entryTypeMatch`, `termTaxonomyMatch`, `metaEquals` and `termMetaEquals`, so a
plugin-authored rule kind can mint a narrowing of its own the way core mints `named`.

The five `*Targets` constructors publish the narrowings core already knows how to compare — `slug`,
`id`, `where`, `whereMeta`, `archive`. A rule kind wanting one they do not publish, the way `named`
is `templates`' own, needs the two pieces underneath them: the node prefix the narrowing hangs off
and the predicate that goes inside it. Both were module-private, so core built `named` from one
place while a third-party rule kind had to restate the matcher — the coupling the shared vocabulary
exists to remove, which does not stop being one a level down.

`entryTypeMatch` and `termTaxonomyMatch` now take a registered name rather than a `string`, so a
narrowing of your own rejects a typo where a hand-written object literal would compile into a rule
that never matches. Both are what the `*Targets` constructors already call, so what they mint is
unchanged.

`MatchNarrowing` — what a `*Match` constructor accepts on top of the prefix — is published with
them, and reaches everything on the matcher except `nodeKind` and `type`: minting those from one
place is the job, so overriding them is now a compile error rather than a quiet way back to a
hand-written matcher.

[Custom Rule Kinds](https://plumix.dev/themes/rule-kinds/) documents the four, including the one
trap that remains: a predicate tests the data shape as well as the value, and nothing rejects an
entry predicate on a term matcher.
