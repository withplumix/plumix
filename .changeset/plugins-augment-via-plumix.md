---
"@plumix/plugin-menu": patch
"@plumix/plugin-comments": patch
"@plumix/plugin-blog": patch
"@plumix/plugin-media": patch
"@plumix/plugin-audit-log": patch
---

Augment the public `plumix` specifier instead of the `plumix/plugin` subpath.

These plugins declared their `TemplateDepRegistry`, `ReferenceHydrationShapes`,
`FilterRegistry`, `ActionRegistry`, and `AppContextExtensions` contributions via
`declare module "plumix/plugin"`. A theme augmenting a registry through the root
`plumix` specifier (the documented convention, #1691) would not co-merge with a
`plumix/plugin` augmentation of the same interface — declaration merging
fractures across specifiers, dropping one side's keys. All augmentations now
target `declare module "plumix"` so themes and plugins share one merged view.

No runtime or public-API change: the plugins' value imports still come from
`plumix/plugin`, and consumers read the contributed kinds through the same
`defineTemplate` / reference-field surfaces as before.
