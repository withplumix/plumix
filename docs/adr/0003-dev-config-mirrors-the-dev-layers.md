# The dev config tree mirrors the dev layers, and only registered panels are nameable

`plumix.config.ts` takes a `dev` block whose members are the dev debug layers —
`dev.bar` is the overlay, `dev.panels` is the panel vocabulary both dev surfaces
render — and each layer normalizes its own slice. Panel ids are closed: core
seeds a `DebugPanelRegistry` interface, a plugin augments it to declare its
panel, and `dev.panels` keys off it.

## Why the config tree mirrors the layers

The slot this replaced was `debugBar`, named after a widget. It carried a
denylist of panel ids alongside two settings only the overlay reads, so a
panel-layer setting was spelled as bar config. That had a structural cost:
#2422 split the cluster into capture → panels → surfaces and made the import
direction a tested property, and the module resolving the denylist could then
live in neither surface — the read routes would have had to import it out of the
overlay's directory, which the guard rejects. It was hoisted to a zero-import
leaf, which resolved the edge and left four units where the design was three.

Naming the block after the concern rather than the widget dissolves that. The
panel layer owns `dev.panels` because it is the layer that consumes it; the bar
surface owns `dev.bar`; the composed `DevInput` is assembled in `config.ts`,
outside the dev tree, so no module under `dev/` has to name all of its layers to
declare the shape. The leaf disappears because nothing needs it, not because it
was moved somewhere else.

The rule generalises, which is the point: a dev-only setting has an obvious home
instead of a new top-level slot. `dev.history` — the request-history ring's
bounds — is the third member, and getting it there forced the corresponding
ownership fix. The ring was a module binding created at import time, so it was
reachable by everyone and configurable by no one; the app now builds it from
`config.dev.history` and hands it down the context, which is the same shape the
rest of the cluster already had (#2442). A setting the config tree can express
but the code cannot receive is the tell that ownership is in the wrong place.

## Why the extension point is open and the configuration surface is closed

`DebugPanel.id` stays `string`: anyone may contribute a panel through the
`debug:panels` filter, including a one-off in a test or an app-local panel
nobody wants to declare a type for. Only _naming_ a panel in config is closed.

A denylist of free strings is silently wrong when mistyped: any string
type-checks, so a misspelled panel id was a setting that did nothing rather
than an error. It offered no autocomplete either, so the five core ids had to
be looked up in the docs each time. Typo safety comes from
closing the key set, not from the shape of the setting; a closed-union array
would have been equally safe. The map wins on reading, because its keys _are_
the extension point, so the registry closes them structurally.

The trade is that a plugin panel is config-addressable only if its plugin ships
the augmentation. A third-party panel whose author never adds one cannot be
silenced from `plumix.config.ts` — accepted, because the filter removes panels
and is always available, and because the alternative leaves every key in the
block a silent-typo risk.

## Consequences

- `debugBar` is gone with no alias, and the `debug_bar:panels` filter is now
  `debug:panels`. Both were the same category error — bar vocabulary for
  panel-layer things — so they were renamed together rather than breaking
  plugin authors twice.
- `enabled` is gone from the bar: `false` is the only spelling of off.
- The dev layers guard drops its `config` unit. Four units, one direction.
- The request-history module exports no singleton. Every reader — the bar, the
  read routes, both dev MCP tools — takes the app's instance off the context,
  so a production build has no ring at all rather than an unreachable one.
- A plugin that contributes a panel and wants it nameable must augment
  `DebugPanelRegistry` and anchor that augmentation into its published
  declaration graph, the same way a hook augmentation is anchored (#1698).
