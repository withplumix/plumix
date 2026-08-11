# Extending Plumix's types

Plumix ships a handful of **augmentable registries** — TypeScript interfaces you
extend with declaration merging so first-class APIs (`forEntryType`, `block`,
`defineTemplate`, …) narrow to *your* names, autocomplete them, and reject typos
at compile time.

## The one rule

Always augment the public **`plumix`** specifier — the package you install.
Never reach into internal `@plumix/*` packages or `plumix/*` subpaths.

```ts
declare module "plumix" {
  interface EntryTypeRegistry {
    insight: { entry: ResolvedEntry };
  }
}
```

This is enforced by lint (`no-restricted-syntax`): augmenting `@plumix/core`,
`@plumix/blocks`, `plumix/plugin`, or any other subpath is an error.

### Why one specifier

Module augmentation only merges cleanly when everyone targets the *same*
specifier. Augmenting the same interface through two of them — say `plumix` in a
theme and `plumix/plugin` in a plugin — silently fractures the type: each view
keeps its own keys and drops the other's. A theme that augmented `@plumix/core`
(the old, wrong advice) got no merge at all, because consumers don't depend on
`@plumix/core` — the augmentation targeted a module that wasn't there, so it
quietly no-op'd. One specifier, `plumix`, avoids both traps.

## Worked example: a custom entry type

A plugin (or your app) registers an `insight` entry type and wants
`forEntryType("insight")` to type-check in the theme:

```ts
import { defineTheme, forEntryType } from "plumix";
import type { ResolvedEntry } from "plumix";

declare module "plumix" {
  interface EntryTypeRegistry {
    insight: { entry: ResolvedEntry };
  }
}

export default defineTheme({
  templates: [
    forEntryType("insight").template(InsightTemplate),
    // forEntryType("typo") // ← compile error: not a registered entry type
  ],
});
```

The projection type (`{ entry: ResolvedEntry }`) is what `data.entry` narrows to
in the template. Register a name without an `entry` projection and it falls back
to the base `ResolvedEntry`.

## The augmentable registries

| Registry | Augment to type… | Read by |
| --- | --- | --- |
| `EntryTypeRegistry` | custom entry-type names + `data.entry` | `forEntryType` |
| `TermTaxonomyRegistry` | custom taxonomy names + `data.term` | `forTermTaxonomy` |
| `ArchiveTypeRegistry` | plugin archive-type names + `data` | `forArchiveType` |
| `TemplateDepRegistry` | template dep-slot kinds + result type | `defineTemplate` / `registerTemplateDep` |
| `BlockTypeRegistry` | block name → attrs shape | `block()` |
| `PatternCategoryRegistry` | pattern category slugs | `definePattern` |
| `ReferenceHydrationShapes` | reference kind → hydrated shape | reference fields |

All seven live behind `declare module "plumix"`.

## Plugin authors: keep `plumix` loaded

`declare module "plumix"` only resolves if the file (or its compilation) also
imports from `plumix` — otherwise TypeScript reports
*"module 'plumix' cannot be found"* at the plugin's own build. Most files import
something from `plumix` already. If a file augments `plumix` but otherwise only
imports from the `plumix/plugin` subpath, pull the types it uses from `plumix`
instead (they're the same symbols), or add a bare `import type {} from "plumix"`:

```ts
import type { HydratedReference } from "plumix"; // loads the augmentation target
import { and, eq } from "plumix/plugin";         // runtime db helpers stay here

declare module "plumix" {
  interface ReferenceHydrationShapes {
    media: MediaReference;
  }
}
```

### Reachability

An augmentation only takes effect in a consumer's compilation if the file
declaring it is in that consumer's `tsc` program. For a workspace-package
plugin, colocate the `declare module "plumix"` block with the result type the
plugin exports from `/server`, so a theme importing that type pulls the
augmentation in too. See `registerTemplateDep`'s JSDoc for the full pattern
(including consumer-local plugins).
