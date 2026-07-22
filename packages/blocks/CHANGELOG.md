# @plumix/blocks

## 0.5.0

## 0.4.0

### Minor Changes

- [#1471](https://github.com/withplumix/plumix/pull/1471) [`47ec8e2`](https://github.com/withplumix/plumix/commit/47ec8e293dc3c0dd54da34c63c449182a302745e) Thanks [@nasyrov](https://github.com/nasyrov)! - Add author archives end-to-end: `/authors/{slug}` renders a paginated list of a given author's published entries, themeable like any other archive.

  The full seam is wired: a new `author` `RouteIntent`, framework routes for `/authors/:slug` (+ `/page/:n`), a `resolveAuthor` resolver (the author's published, public-type entries — unknown slug or out-of-range page → 404), an `author` `ResolvedNode`, a generic `author()` template tier, a `forAuthor(slug)` / `forAuthor(id)` targeted builder, and a typed `AuthorArchiveData { author; entries; pagination }`. An author RSS/Atom feed is served at `/authors/{slug}/feed`, and author-archive pages advertise it via `<link rel="alternate">`.

  ```ts
  defineTheme({
    templates: [
      author(AuthorArchive), // every author archive
      forAuthor().slug("jane").template(JaneArchive), // one author, by slug
      forAuthor().id(1).template(FounderArchive), // or by id
    ],
  });
  ```

  Authors are addressed by a new **`users.slug`** column (globally unique, mirroring `terms.slug` / `entries.slug`). It is derived from the user's name via `slugify` at creation — falling back to `user`, de-duplicated with a numeric suffix (`jane`, `jane-1`, `jane-2`), and never derived from the email — and is stable across later name changes. `ResolvedAuthor` now carries `slug`, so `data.author` / `entry.author` can link to an author archive.

## 0.3.0

## 0.2.0

## 0.1.4

## 0.1.3

## 0.1.2

## 0.1.1
