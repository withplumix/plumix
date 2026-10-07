# A page kind is named by its subject

Seven published unions answer "what kind of page is this", and they spelled the
same page four different ways (#2462). One entry was `single` to the route,
`entry` to the current request entity and the template data, and `content` to
the resolved node a rule matches on. A term's page was `taxonomy` in the route
and the template data but `term` in the resolved node. The front page was
`front-page` in one union and `frontPage` in the next. Anyone reading route,
render, theme or CDN code had to translate between these names, and plugins did
too: og's dev sample data warned that a matcher's `nodeKind` "is the
resolved-node vocabulary, not the page-data one".

"Archive" made it worse. ADR 0008 defines an **archive** as any listing
described by one entry query: the front page, an entry type, a term, an author,
a date, or one a plugin registers. Every union still used `archive` for the
entry-type listing alone.

> **A page kind is named after what the page is about: `entry`, `entryType`,
> `term`, `author`, `date`, `archiveType`, `frontPage`, `search`. Every union
> that says what kind a page is spells it with these words, and "archive" is
> never a page kind.**

Amended by ADR 0035, which adds `view` for a per-visitor app page.

## What this means

- **Named by subject.** A term's page is `term` because it is about one term,
  not the whole taxonomy. An entry type's listing is `entryType`. A
  plugin-registered archive is `archiveType`, matching `registerArchiveType`
  and `forArchiveType`.
- **camelCase for multi-word kinds**, so a discriminant, its builder and its
  guard are spelled alike: `frontPage`, `frontPage()`, `isFrontPage`.
- **The unions stay separate.** Each one carries different data. Where one is a
  subset of another it is derived: `TargetMatcher["nodeKind"]` is
  `ResolvedNode["kind"]` without `frontPage` and `search`. A type test keeps
  `ListingPageTarget["kind"]` inside `ResolvedNode["kind"]`.
- **Translations are near-identity.** The resolved-node kind serves the generic
  tier of the same name. The one exception is `archiveType`, which has no tier
  of its own and falls back.
- **"Archive" keeps its broad sense.** The targeted `.archive` selector on
  `forEntryType` stays: there it means the type's archive, qualified by the
  entry type.
- **URLs keep their own spelling.** A URL is a vocabulary of its own and is not
  renamed with the kinds. og's card paths stay `front-page` and
  `archive/<type>`, and `cardTargetPath`/`parseCardTargetPath` map between the
  kind and the segment explicitly, so no stored card or shared `og:image` link
  breaks.
- **Conditions are not page kinds.** The `error` template data and the
  `notFound`/`serverError` tiers name a condition, not a subject, and stay as
  they are.

## Considered options

- **Narrow "archive" to the entry-type listing** (rejected). This would keep
  `archive` as a discriminant, but it would rewrite ADR 0008's vocabulary, where
  the front page, a term, an author and a date are archives too.
- **Keep the theme's words** (`archive`, `taxonomy`) everywhere (rejected).
  These were the most visible names, on the theme author's surface. Keeping them
  keeps the clash with the glossary: `archive` is broader than the one page it
  would name, and `taxonomy` names the grouping, not the term the page is about.
- **Kebab-case multi-word kinds** (`front-page`) (rejected). A discriminant
  would then be spelled differently from its builder and guard, and every
  switch would quote a key that the matching function cannot use as its name.
