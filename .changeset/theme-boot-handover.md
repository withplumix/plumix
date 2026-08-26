---
"@plumix/core": minor
---

Adds `theme:ready`, a boot-time action that hands a plugin the theme's own descriptor.

Plugins could not read what a theme declared. Plugin setup runs before the theme is looked at, and
the descriptor sat on the app without ever being offered to anyone — block, mark and shortcode
registries reached plugins only because core pre-aggregated each one itself, which requires core to
know what it is aggregating.

`buildApp` fires `theme:ready` once, right after plugins install and before core assembles any
registry. A subscriber reads the field it cares about, keeps whatever it needs of its own, and
carries anything request-scoped through the existing `extendAppContext` — the theme itself never
joins the request context. Because the handover runs ahead of core's aggregation, a subscriber that
registers off the back of what it read (a shortcode, a route, a `theme:document` filter) is still in
time for every registry below it.

Core names no field on the descriptor. A plugin adds one by augmenting `ThemeDescriptor` through the
single `declare module "plumix"` specifier, the same way every other plumix registry is extended.

Note that the handover fails soft, as every action does: a subscriber that throws is reported through
the action-failure path and boot continues, leaving that plugin's own registry unpopulated.
