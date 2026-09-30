# Core is one package of enforced layers

The #2297 audit split `@plumix/core` into seven units to read it. That left a
question open: is one package boundary around all of it the right shape (#2457)?
The long-term direction we had discussed was illuminate-style: a contracts
kernel plus satellite packages behind the `plumix` façade.

We mapped core's import graph before deciding. There is no kernel to extract.
25 of core's 28 subsystems form one strongly connected component, counting type
imports or not. Taking out the composition root and the façades does not break
it. Most of the tangle is contracts filed in the wrong place:

- `AppContext` sits in `context/app.ts` next to the wiring that builds it.
  That one file accounts for 119 upward edges. The type moves to a sibling
  file in `context/`, and only the wiring stays at the top.
- The response helpers, the secret-slot contract and the binding types live
  under `runtime/`.
- The meta pipeline that `entries/`, `terms/` and `route/` all need lives under
  `rpc/`.

Six reclassifications take 283 violations of a draft layer table down to 51.
Every extracted package would have to break those cycles first, so the layering
is needed either way. Once it exists, packaging adds nothing that a consumer
could see.

> **`@plumix/core` stays one package. Inside it, code is arranged in layers that
> may only import downward. Two enforcers read the same table. `@plumix/blocks`
> merges into core as its bottom layer. Consumers see no change: they import
> from `plumix`, as before.**

## The layers

| Layer          | Holds                                                                                                                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `foundation`   | `blocks/`, `i18n/`, and the pure utilities (`json`, `base-path`, `slugify`, `escape-html`, `css-tag`, `non-empty`, `return-url`, `document-merge`, `telemetry-otel`)                               |
| `contracts`    | `plugin/`, `hooks/`, `context/`, `config*`, `theme*`, `template*`, `settings-core`, `support`, `db/schema/`, and every `<subsystem>/contract/`                                                     |
| `capabilities` | `db/`, `meta/`, `access/`, `auth/`, `entries/`, `terms/`, `users/`, `revisions/`, `search/`, `seo/`, `images/`, `storage/`, `cdn/`, `route/`                                                       |
| `surfaces`     | `rpc/`, `rest/`, `mcp/`, `admin-bar/`, `admin/`, `dev/`, `dev-client/`, `cli/`, `welcome/`, `welcome-theme`                                                                                        |
| `top`          | The composition root and the assembled façades: `runtime/`, plus five single files named by role: `index.ts`, `context/app.ts`, `plugin/setup-context.ts`, `db/public.ts`, `hooks/public-hooks.ts` |

- **One folder, one layer.** When a subsystem spans two layers, its lower half
  moves into a colocated `contract/` subfolder: `runtime/contract/`,
  `route/contract/`, `access/contract/`. The deepest matching folder decides a
  file's layer, so the folder a file sits in says what it may import. Only
  `top` also names single files.
- **Being an `exports` target is a packaging fact, not a layer.**
  `plugin/manifest.ts` or `i18n/index.ts` stays in its home layer, even though
  a consumer can import it.
- **`top` may import anything, and nothing inside core imports `top`.** An
  internal module never reaches a public entry point.
- **Same-layer imports are allowed if they form no cycle.** The subsystem graph
  inside each layer must be acyclic. One set of `contracts` subsystems counts
  as a single unit for this rule: see
  [The `AppContext` unit](#the-appcontext-unit).
- **`import type` counts as an edge for direction.** Erasing an import is the
  cheapest way to point a layer back up the stack. Dynamic `import()` counts
  too.

## The `AppContext` unit

Moving `AppContext` out of `context/app.ts` into `contracts` (#2592) exposed a
cycle that no move can break. `AppContext` carries the resolved config
(`ctx.config`), the hook executor (`ctx.hooks`) and the plugin registry
(`ctx.plugins`). The plugins, templates and theme those carry declare their
handlers as `(ctx: AppContext) => …`, and the hook registry runs its handlers
inside the request's ambient store, which holds an `AppContext`. The context
names the registries, and the registries name the context. That is the shape of
the thing, not a misfiled contract.

> **`context/`, `plugin/`, `hooks/`, `config.ts`, `template.ts`,
> `template-deps.ts` and `theme.ts` count as one subsystem for the same-layer
> cycle rule. A cycle inside the unit is allowed. A cycle between the unit and
> any other `contracts` subsystem is still a violation.**

The members are the import graph's strongly connected component around
`context/`, and nothing wider. `theme.ts` is in it because `ctx.config` carries
the theme, whose templates take an `AppContext`. `template-registry.ts` and
`template-deps-core.ts` each have edges in one direction only, so they stay
separate subsystems. The unit is scoped to `contracts`: the
`top` files under `context/` and `plugin/` are not in it.

Two alternatives were rejected. Declaring `PluginRegistry`, `PlumixConfig` and
`HookExecutor` inside `context/` moves the cycle instead of breaking it: the
rest of the plugin vocabulary comes along. Typing the three fields against
narrower interfaces changes `AppContext`'s shape, and ADR 0011 requires
`ctx.config` to be the full resolved config.

**The way to split it later** is to make the registries and handler types
generic over the context: `PluginRegistry<Ctx>`, `HookExecutor<Ctx>`,
`TemplateRenderArgs<TData, Ctx>`, with `plugin/`, `hooks/` and the template
modules naming no concrete context and the hook registry handed the store it
reads. Only `context/` would then instantiate them with `AppContext`, and the
edges would run one way. That reworks every plugin-facing signature, so it
waits until the unit gets in the way of something: a layer extraction, or a
plugin API change that touches those types anyway. When it lands, the unit
leaves the layer table.

## The environment axis

Each folder in the table is also either **client-safe** or **server-only**.
Client-safe folders include `blocks/`'s island and renderer code and
`dev-client/`. Nothing reachable from a client entry may reach a server-only
module. This rule follows runtime edges transitively; type-only edges don't
ship code and are ignored. This is the job the `@plumix/blocks` package boundary
used to do by accident.

## Enforcement

Core owns one layer table, a TS module that both enforcers import:

- **eslint-plugin-boundaries** checks direction per file, so a wrong import
  shows as an error in the editor while it's being typed.
- **The import-graph suite** (the helper behind `cold-path` and `debug-layers`)
  checks what per-file lint can't see: client→server reachability and cycles
  between subsystems.

The rules land before the code conforms. Today's known violations go into
baselines that can only shrink: ESLint bulk suppressions for direction, and a
checked-in list for the graph rules. Each follow-up ticket deletes its entries.
Both baselines are removed when they're empty.

## Considered options

- **Kernel plus satellite packages, illuminate-style** (rejected). Laravel's
  pieces are real packages because Eloquent and the container are used without
  Laravel. No part of Plumix is used without `plumix`. Packaging would add build
  nodes, a longer fixed changeset group, more tarballs, and cross-package `.d.ts`
  traps like #2347, all for goals the layers already meet.
- **Keep `@plumix/blocks` separate** (rejected). Its separation made it the only
  shelf both an island and the server could reach. It picked up things that are
  not blocks: `JsonValue`, the CSRF header, and a copy of `Label` held in step
  only by a comment.
- **One test only, no lint plugin** (rejected). No new dependency, but
  violations would surface in CI instead of at the keyboard.
- **dependency-cruiser for reachability** (rejected). Its `reachable` rules
  can't leave type-only edges out, and its workaround reads transpiled output,
  which disagrees with how `verbatimModuleSyntax` links inline type specifiers.
- **A layer table of file-level exceptions** (rejected). About 25 globs of
  "this file, not its folder" would rot unread. Moving the files keeps the table
  short enough to read.

## Consequences

- A consumer sees none of this. The `plumix/blocks*` subpaths re-point to core.
  `@plumix/blocks` leaves the fixed changeset group and is deprecated on npm.
- The layer names are build vocabulary, not domain vocabulary (ADR 0001). They
  live here and in `AGENTS.md`, not in `GLOSSARY.md`.
- **When to revisit.** Splitting a layer into its own package is reconsidered
  only when something outside the `plumix` façade needs that layer alone, or a
  layer needs its own version. Once the layers are acyclic, extracting one is
  mechanical. Until then, "should core be split?" is answered here.
