---
"create-plumix-app": minor
"@plumix/plugin-feeds": minor
"@plumix/plugin-seo": minor
---

Preselects the SEO and feeds plugins in `create-plumix-app`. Both now declare `recommended: true` in
their `plumix.scaffold` block, the wizard opens its plugin step with them ticked, and a run with no
`--plugins` flag takes them — so the realistic default project serves head meta, `robots.txt`, a
sitemap and feeds on first run rather than none of them.

The recommendation is the plugin's, not the scaffolder's: `loadRegistry` carries the flag into the
descriptor and `recommendedPluginIds` reads it back, so a future plugin opts into the default project
by editing its own `package.json`.

Flags still decide, in both directions. `--plugins <ids>` replaces the recommended set rather than
adding to it, so `--plugins blog` scaffolds blog alone, and `--plugins=` scaffolds none. A
deselected plugin leaves behind no import, no registration and no dependency of its own — the one
exception being a package another selected plugin declares as a peer, as `@plumix/plugin-og` does
for `@plumix/plugin-seo`.
