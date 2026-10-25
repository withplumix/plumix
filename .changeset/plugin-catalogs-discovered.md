---
"plumix": minor
---

Removes the `locales` field from a plugin's `i18n` slot, along with the locale list `PLUGIN_I18N_SLOT` carried. The build now discovers the locales a plugin ships from the compiled `<locale>.mjs` catalogs under its `catalogPath`, so adding a `.po` file and running `i18n:compile` is all a new language takes. Plugin authors should delete `locales` from their slot, which is now a type error.
