---
"@plumix/plugin-audit-log": patch
"@plumix/plugin-blog": patch
"@plumix/plugin-comments": patch
"@plumix/plugin-media": patch
"@plumix/plugin-menu": patch
"@plumix/plugin-pages": patch
---

Ships each plugin's compiled Lingui catalogs in the published tarball. Every one
of these plugins declares an `i18n` slot pointing at `./locales`, which the
plumix Vite plugin copies out of the installed package at build time — but
`package.json#files` allowlisted only `dist`, so the directory was absent from
the tarball and a site installing the plugin from npm failed `plumix build` with
`adminAssetNotFound`. Inside this repo a plugin resolves to a symlinked source
tree, where the catalogs are always present, which is why nothing caught it.
