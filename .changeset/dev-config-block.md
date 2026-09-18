---
"@plumix/core": minor
---

Replaces the `debugBar` config slot with a `dev` block: `dev.bar` is the debug bar (pass `false` to suppress it, or `{ position, defaultOpen }`), and `dev.panels` says which debug panels the site shows, keyed by panel id — `{ database: false }` hides one. `dev.panels` is read by the bar and by the request-history viewer alike, so switching a panel off hides it on both.

Panel ids are now checked against a `DebugPanelRegistry` a plugin augments to declare its own panel, so naming a panel nothing contributes is a type error instead of a setting that quietly does nothing.

Breaking: `debugBar` is removed with no alias — `debugBar: false` becomes `dev: { bar: false }`, and `debugBar: { disable: ["database"] }` becomes `dev: { panels: { database: false } }`. The bar's `enabled` key is gone; `false` is the only spelling of off. The `debug_bar:panels` filter plugins contribute panels through is renamed `debug:panels`.
