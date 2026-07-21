---
"@plumix/core": minor
---

Add date archives end-to-end: `/YYYY`, `/YYYY/MM`, and `/YYYY/MM/DD` render paginated lists of entries published in that period.

The same seam as author archives: a `date` `RouteIntent`, numeric-constrained framework routes for the three granularities (+ `/page/:n`), a `resolveDate` resolver (a half-open `publishedAt` range query — an empty period renders the archive, an impossible date like Feb 30 or an out-of-range page → 404), a `date` `ResolvedNode`, a generic `date()` template tier, a `forDate(year[, month[, day]])` targeted builder, and a typed `DateArchiveData { year; month; day; entries; pagination }`. RSS/Atom feeds are served at `/YYYY[/MM[/DD]]/feed` and advertised on the archive page via `<link rel="alternate">`.

```ts
defineTheme({
  templates: [
    date(DateArchive), // every date archive
    forDate(2026).template(YearInReview), // the /2026 year archive
    forDate(2026, 12, 25).template(Holiday), // the /2026/12/25 day archive
  ],
});
```

`forDate` matches one exact granularity — `forDate(2026)` targets the year archive, not that year's month/day archives.
