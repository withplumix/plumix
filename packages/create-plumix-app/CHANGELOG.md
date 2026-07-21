# create-plumix-app

## 0.2.1

### Patch Changes

- [#1456](https://github.com/withplumix/plumix/pull/1456) [`4cdb59e`](https://github.com/withplumix/plumix/commit/4cdb59ed70c2d83d5b1461a754970709cba92910) Thanks [@nasyrov](https://github.com/nasyrov)! - Redesign the theme template system around a typed, array-based `templates` model with router-style resolution.

  A theme's `templates` is now an **array of rules** built with typed helpers instead of a slug-keyed object. Generic tiers are direct builders — `fallback`, `entry`, `archive`, `taxonomy`, `frontPage`, `search`, `notFound`, `serverError` — and targeted rules are built with `forEntryType(name)` / `forTermTaxonomy(name)`, which autocomplete against the registered types, reject typos at compile time, and type `data.entry` / `data.term`:

  ```ts
  defineTheme({
    templates: [
      fallback(HomeAndArchives),
      entry(Post),
      forEntryType("page").template(Page),
      forEntryType("post").whereMeta("featured", true).template(FeaturedPost),
      forTermTaxonomy("category").slug("news").template(NewsArchive),
      notFound(NotFound),
    ],
  });
  ```

  Resolution follows a Laravel-router model: targeted rules in declaration order (first match wins), then the generic tier for the resolved node, then `fallback`. When nothing matches and there is no `fallback`, the request renders the 404 — a missing `fallback` is the "render-all vs. 404-on-miss" lever, not an error. Augment `EntryTypeRegistry` / `TermTaxonomyRegistry` alongside `registerEntryType` / `registerTermTaxonomy` to teach the builders your own types.

  The dev debug bar's Template panel now shows the full resolution walk for each request — every rule with a matched / skipped / never-evaluated status and its predicate outcome — so it's clear why a page got the template it did.

  **Breaking changes** (theme and plugin authors):

  - `templates` must be a `TemplateRule[]` (or a bare component as fallback shorthand). The slug-keyed object form (`{ index, single, "single-post", "404", … }`) is removed. Map old slots to builders: `index` → `fallback`, `single` → `entry`, `single-<type>` → `forEntryType("<type>").template`, `archive` → `archive`, `<taxonomy>` → `forTermTaxonomy(...)`, `404`/`500` → `notFound`/`serverError`.
  - The `notFound` export from `@plumix/core` / `plumix` is now the 404 **template builder**, not the HTTP `Response` helper (which is internal). Build error responses your own way.
  - `defineTemplate`'s `prefetchListingLoaders` field is renamed to `prefetchArchiveLoaders`.
  - The `template:hierarchy` hook filter is removed; template targeting is compile-time via the builders.

## 0.2.0

### Minor Changes

- [#1393](https://github.com/withplumix/plumix/pull/1393) [`b1cd13f`](https://github.com/withplumix/plumix/commit/b1cd13f9f605860b7255948c19a5cba1c065a63f) Thanks [@nasyrov](https://github.com/nasyrov)! - Scaffold projects by composing a runtime with the plugins you pick, instead of copying a fixed example.

  On a terminal `create-plumix-app my-site` now asks for the project directory, runtime, plugins, and auth methods, then installs dependencies, sets up a local database, and initialises a git repository. Pass flags to skip the wizard entirely:

  ```bash
  pnpm create plumix-app my-site --plugins blog,pages,media
  ```

  - `--runtime <id>` — runtime to target (default: `cloudflare`)
  - `-p, --plugins <ids>` — comma-separated plugins to include
  - `--pm <name>` — package manager (npm, pnpm, yarn, bun); auto-detected
  - `--no-install`, `--no-db`, `--no-git` — skip the matching post-scaffold step
  - `-y, --yes` — accept defaults; with no `--plugins`, scaffolds a blank app

  A blank app is the runtime on D1 with passkey auth — the smallest thing that runs. Each plugin adds its own config, dependencies, and any runtime bindings it needs, so `plumix dev` works immediately after scaffolding rather than failing on a missing database.

  Plugins describe their own scaffolding, so the set offered here follows whatever is published rather than a list baked into the CLI.

  **Breaking:** `--template` is removed. It cloned a whole example; plugins are now selected individually with `-p/--plugins`. Passing it exits with a message pointing at the replacement.

## 0.1.2

## 0.1.1
