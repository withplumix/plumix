---
"plumix": minor
---

Changes `plumix i18n compile` to emit ES module catalogs (`locales/<locale>.mjs`) and to exit non-zero when a catalog has a message Lingui can't parse. It used to emit CommonJS and succeed anyway. Missing translations still fall back to the source string. The new `--dts` flag writes a `.d.mts` declaration beside each catalog, and any other argument is passed to `lingui compile`.

`plumix i18n init` now scaffolds `i18n:extract`, `i18n:compile` and `i18n:check` as `plumix i18n extract`, `plumix i18n compile` and `plumix i18n verify`, and adds a `prepack` script that runs `plumix i18n compile`. It no longer writes `scripts/i18n-compile-check.mjs`. If you ran an earlier `init`, update those scripts yourself (`init` won't overwrite them), add the `prepack` script, and delete `scripts/i18n-compile-check.mjs`.
