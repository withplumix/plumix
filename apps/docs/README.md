# @plumix-apps/docs

The Plumix **documentation site**, on [Astro Starlight](https://starlight.astro.build/).
Docs is the one surface we deliberately don't dogfood on plumix — a general CMS
fights a docs site's needs (search, MDX, versioning).

**Status: scaffold.** A working Starlight app with one placeholder page. It's
markdown-only — no custom `.astro` components — so it needs no Astro-specific
prettier/eslint wiring today; markdown formats with the repo's stock prettier.
Typechecking runs through the shared `@plumix/typescript-config` and caches via
turbo like every other workspace.

The real docs — moving/authoring content, the sidebar, and semver-aware
versioning (inline "Added in x.y" badges pre-1.0; `starlight-versions` snapshots
per major from 1.0) — land with the **docs-site follow-up** to #1425.

## Develop

```bash
pnpm dev        # astro dev — http://localhost:4321
pnpm build      # static build → dist/
pnpm typecheck  # astro sync + tsc
pnpm test:unit  # the content checks
```

## Link and anchor validation

`starlight-links-validator` runs on `pnpm build` and fails it on any internal
link that does not resolve — including a `#heading` that no longer exists.

One gotcha when adding a page: **give it a body.** A frontmatter-only page never
reaches the markdown pipeline, so the validator never records it, and every link
to it is reported invalid.

Links carrying the site's own origin (`https://docs.plumix.dev/...`) are _not_
checked: `sameSitePolicy` defaults to `ignore`, which skips them even though
`site` is now set. Write cross-references root-relative. Closing that gap is a
one-option change, left to the ticket that owns the gate.

## Machine-readable output

`starlight-llms-txt` writes three files into `dist/` at build time, so a coding
agent can fetch selectively against an index or ingest the corpus in one go:

| File             | What it is                                                                         |
| ---------------- | ---------------------------------------------------------------------------------- |
| `llms.txt`       | The entry point — names the project and links the two corpus files                 |
| `llms-full.txt`  | Every published page as markdown, each under its title and lede                    |
| `llms-small.txt` | The same corpus with notes, tips and `<details>` stripped and whitespace collapsed |

Note that `llms.txt` indexes the corpus files, not the pages — the plugin builds
no per-page listing. Pages marked `draft: true` are excluded from both corpus
files.

The plugin throws without `site`, which is why `astro.config.mjs` declares
`https://docs.plumix.dev`: llms.txt links the corpus with absolute URLs, and an
agent holding only the index has no base to resolve a relative href against.
That absolute base also lets Starlight emit a sitemap and per-page
canonical/`og:url` metadata, neither of which the site carried before.

## Content checks

`src/content-checks/` walks a content root once and reports every page that
breaks a documentation convention. Each check takes the pages that one
traversal produced and **returns findings** rather than asserting, so a run
names every offending page at once.

`runContentChecks` takes the root as a parameter: the suite points it at
`src/content/docs` for the production run and at `test/fixtures/content` for
the deliberately-broken pages that prove each check catches what it claims to.
Fixtures have to live outside the real content root, or the production run
would flag them.

Today the suite carries one check: page shape. Every documentation page owes a
lede — prose between the frontmatter and the first heading — and four sections:
Overview, Quickstart, Related, Next steps. A roster page declares
`roster: true` and enumerates its items as `###` headings, which exempts it
from the quickstart. A landing page declares Starlight's own `template: splash`
and is not held to the template at all.

Two more checks are planned on the same traversal: sample type-checking
([#1858][]) and roster drift ([#1859][], [#1860][]).

[#1858]: https://github.com/withplumix/plumix/issues/1858
[#1859]: https://github.com/withplumix/plumix/issues/1859
[#1860]: https://github.com/withplumix/plumix/issues/1860

## Why Starlight is capped below 0.41.7

`@astrojs/starlight` is held to `>=0.41.5 <0.41.7`, not a caret range.

The floor is deliberate: `0.41.4` and `0.41.5` fixed `docsSchema({ extend })`
bugs with Zod enums and unions, which the frontmatter schema needs.

The ceiling is an upstream break, and it arrived after the fact. `0.41.7`
shipped on 5 August with `@astrojs/markdown-satteri: ^0.3.5` and its own
`satteri: ^0.9.1` — consistent at the time. On 19 August
`@astrojs/markdown-satteri@0.3.7` moved to `satteri@^0.10.3`, and that range
swallowed it. Two Sätteri copies now meet inside Starlight's own
`integrations/markdown-plugins.ts`, which `pnpm typecheck` compiles from source
— so the docs app stops type-checking on a dependency it never imports.

Starlight is migrating to the Sätteri 0.10 APIs in
[withastro/starlight#4134](https://github.com/withastro/starlight/pull/4134),
which is blocked on an Astro release carrying
[withastro/astro#17766](https://github.com/withastro/astro/pull/17766) (merged,
unreleased as of 22 August). Lifting the ceiling here is tracked by
[#1865](https://github.com/withplumix/plumix/issues/1865); nothing surfaces the
fixing release automatically, as `.github/dependabot.yml` has no astro or
starlight group.
