---
"@plumix/core": minor
"plumix": minor
---

Makes the dev error page's two filters nameable outside core. `error_page:hints` and
`error_page:panels` were both documented as the plugin-facing way to contribute to the page, but
their type augmentations sat outside the closure the package barrel anchors, so a plugin writing
`ctx.addFilter("error_page:panels", …)` got `Argument of type '"error_page:panels"' is not
assignable to parameter of type 'FilterName'` — the same defect `debug_bar:panels` had. Core now
anchors both.

Promoting them rather than correcting the comments is what the code already implied:
`error_page:panels` has no core subscriber at all, so every panel it collects has to come from a
plugin. A filter nothing outside core can name collects nothing, ever, and the honest alternative
was deleting it.

The contribution shapes `DevErrorHint` and `DevErrorPanel` are exported alongside the
presentational pieces a panel body is built from — `DevErrorFacts`, `DevErrorSubhead` and
`DevErrorEmptyNote`, the same three the page's own sections use, so a contributed panel wears the
page's markup instead of re-spelling its class names.
