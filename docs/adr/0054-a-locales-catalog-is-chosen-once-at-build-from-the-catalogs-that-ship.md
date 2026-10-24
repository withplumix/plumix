# A locale's catalog is chosen once, at build, from the catalogs that ship

Seven places decided which catalog serves a locale, and they disagreed. The
admin boot cut the tag to its language, so `zh-CN` found no `zh` catalog and
rendered English. Block render, mail and the welcome screen looked the tag up
exactly, so `de-AT` rendered English. Admin-area `Accept-Language` negotiation
matched by language alone, so a browser asking for `zh-TW` (Traditional
Chinese) got the `zh-CN` (Simplified) catalog. Adding a language meant editing
code in eight places (#3346).

> **One rule picks the catalog locale of an enabled locale from the locales a
> catalog set ships: the exact tag, then its CLDR parent or the tag with its
> last subtag dropped, repeatedly, never crossing a script, and the source
> locale last. The `.po` files are the only record of what ships. The build
> projects every catalog set to the site's enabled locales with the rule, and
> every runtime lookup is an exact read by the enabled locale's code. The one
> runtime matcher is `Accept-Language` negotiation, and it runs the same rule.**

## What this means

- **The rule is one pure function**, `catalogLocale` in core's `i18n` layer.
  It takes an enabled locale, the locales a catalog set ships and the source
  locale. It uses only `Intl` and generated CLDR data, so it runs on every
  runtime and at build.
- **Tags compare on canonical BCP 47 form**, so case never matters. A tag also
  matches a shipped locale with the same likely subtags: `zh` is `zh-CN`, so
  `zh-SG` climbs to `zh` and reads a `zh-CN` catalog.
- **A step goes to the CLDR parent where CLDR names one, else drops the last
  subtag.** It cuts at subtag boundaries, so `fil` never reaches `fi`.
  `es-MX` reads `es-419`, then `es`; `pt-AO` reads `pt-PT`; `de-AT` reads `de`.
- **No step crosses a script.** Each candidate's `Intl.Locale().maximize()`
  script must equal the tag's, and CLDR gives `zh-Hant` and `sr-Latn` root as
  parent. So `zh-TW` and `zh-HK` read the source locale, never `zh-CN`, and
  `sr-Latn-RS` reads `sr-Latn` but never Cyrillic `sr`.
- **The CLDR data is generated.** `pnpm --filter @plumix/core cldr:generate`
  writes `packages/core/src/i18n/cldr-parent-locales.ts` from `cldr-core`'s
  `parentLocales`, a devDependency of core. A unit test regenerates it and
  fails on any difference, so a `cldr-core` bump cannot leave it stale.
- **Shipped locales come from files.** Adding a language to Plumix or to a
  plugin means adding `.po` files, with no code change.
- **The build projects, the runtime reads exactly.** Each catalog set (each
  core surface, the admin, the editor, each plugin) is projected from its own
  shipped locales to the site's enabled locales. The admin boot, the plugin
  catalog loader, block render, mail, the welcome screen and the admin bar
  read by the enabled locale's code and match nothing.
- **The admin activates the enabled locale.** Lingui, `<html lang>` and `dir`
  use `de-AT`, with the messages of its catalog locale `de`, so dates and
  numbers format the Austrian way.
- **`Accept-Language` is the one runtime matcher**, because its input is a
  request header, not config. It runs the rule per entry, in header order,
  and the first entry a shipped catalog serves wins, the source catalog
  included: `en-US, de;q=0.5` gets English.
- **No option.** No config key, no fallback override and no build warning for
  an enabled locale without a catalog. Falling back to the source locale is
  the documented behaviour.

## Considered options

- **Cut the tag to its language** (the admin boot, Payload, Craft, i18next's
  default). Rejected: it sends Traditional Chinese to Simplified, and
  `zh-CN` never finds a `zh` catalog.
- **Exact lookup only** (block render, mail, WordPress, Drupal). Rejected: a
  regional locale silently shows English though a fitting catalog ships.
- **Lingui's built-in parent table.** Rejected: it is not CLDR's (`zh-Hant` →
  `zh`, `pt-AO` → `pt`), and its lookup is internal to Lingui.
- **Match at runtime in every lookup.** Rejected: seven matchers drift apart,
  and the build already knows both the enabled locales and what ships.
- **Let the first entry that reads a non-source catalog win** in negotiation.
  Rejected: a visitor who accepts English first would get German.
