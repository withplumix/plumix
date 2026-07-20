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
