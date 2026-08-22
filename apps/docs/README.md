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
```

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
