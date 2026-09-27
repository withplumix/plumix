# A plugin gets a page's data from core

A published post titled `Best of [year]` advertised one social card in its own
head and served another. The head computed the card's digest from the data core
rendered the page with: `resolve:single:data` applied, the title's shortcodes
expanded. The card route computed its digest from data it assembled itself, by
running the row through the batched entry resolver and wrapping the result in
`{ kind: "entry", entry }`. The two digests differed, so every scraper that
followed the head's URL was redirected, uncached, to a card reading
`Best of [year]` (#2604).

`@plumix/plugin-og`'s card route, its card preview and `@plumix/plugin-seo`'s
SERP preview each hand-rolled the same assembly, and each missed the same two
steps. The listing side never had the bug, because `resolveListingPage` already
gave a plugin core's own resolution of a listing page, `resolve:*:data` filters
included. An entry had no such call.

> **A plugin that needs a page's data asks core for it, through the same call
> core's own route uses. It never assembles it from rows.**

This follows from [ADR 0002](0002-core-owns-what-would-be-wrong.md). Page data
that differs by caller is not _absent_ in one place. It is _wrong_ in one of
them, so core owns producing it. The calls are `resolveEntryData(ctx, row)` for
one entry, `resolveEntryList(ctx, rows)` for a batch, and `resolveListingPage(ctx,
target)` for a listing page. `resolveEntryData` is the call core's single-entry
route makes. It resolves the row, applies `resolve:single:data`, and expands the
title a subscriber rewrote. `plumix/plugin` no longer exports the raw
row assembler, `buildResolvedEntries`.

`resolveEntryData` takes a row rather than an id, because who may see which
version of an entry differs by caller. Core's public route gates on status and a
preview token, and overlays the token author's autosave. The admin previews gate
through `previewableEntry` on the editor's session. Each caller fetches and
gates its own row, then hands it to the one resolver.

## Considered options

- **A target-taking `resolvePageData(ctx, target)`** (rejected). The preview RPCs
  hold a gated, autosave-overlaid row that no target can name, so a row-taking
  door is needed anyway. A second, target-taking door beside it would be two
  ways in to one answer.
- **A lint rule instead of removing the export** (rejected). The footgun stays
  exported, and only its misuse is pattern-matched. Any assembly the pattern
  does not recognise still ships.
- **The shared function alone** (rejected). Three authors wrote this bug
  independently while the right call for listings sat beside the wrong one for
  entries. Adding a right door without closing the wrong one leaves the choice
  to the next author, and the wrong door is still the one that looks like it
  does the job.

## Consequences

- Previews run the `resolve:*:data` filters. A preview exists to say what the
  page will say, and a subscriber's rewrite is part of what the page says.
- Titles are expanded where a `ResolvedEntry` is minted, in the batched
  resolver. Archives, term, author and date listings, the related-posts strip
  and any card built from them read `[year]` expanded, with no extra query.
  `resolveEntryData` expands again only when a `resolve:single:data` subscriber
  changed the title. A second pass over untouched text would turn an escaped
  `[[tag]]` back into a live one.
- A plugin that needs a new kind of page's data gets it by core adding the call,
  not by the plugin reaching for rows.
