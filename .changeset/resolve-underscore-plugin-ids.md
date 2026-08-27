---
"plumix": patch
---

Resolves a plugin package whose id carries an underscore. `PLUGIN_ID_RE` admits
`_`, npm names conventionally use `-`, and nothing reconciles the two —
`audit_log` ships as `@plumix/plugin-audit-log`. `findPluginPackageRoot` built
its candidates from the id verbatim, so it resolved nothing for that plugin and
`plumix build` failed with `adminAssetNotFound` for catalogs sitting in the
tarball all along. `isAdminBundledPlugin` read the same name and reported every
such plugin as unbundled. Both now try the hyphenated form after the literal
one, so a package whose name really does contain `_` still wins.

Previously masked: `audit_log` was the only affected first-party plugin, and it
declared only its source locale, so the manifest never emitted a catalog URL and
the resolution was never attempted.
