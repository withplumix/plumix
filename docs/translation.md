# Translating plumix

Plumix UI ships in English (`en`) as the source locale. Adding a new locale is a translation pull request — no engineering needed.

## What to translate

Six packages own translatable strings:

| Package                    | Catalog                                          |
| -------------------------- | ------------------------------------------------ |
| `@plumix/admin`            | `packages/admin/locales/{locale}.po`             |
| `@plumix/plugin-pages`     | `packages/plugins/pages/locales/{locale}.po`     |
| `@plumix/plugin-blog`      | `packages/plugins/blog/locales/{locale}.po`      |
| `@plumix/plugin-menu`      | `packages/plugins/menu/locales/{locale}.po`      |
| `@plumix/plugin-media`     | `packages/plugins/media/locales/{locale}.po`     |
| `@plumix/plugin-audit-log` | `packages/plugins/audit-log/locales/{locale}.po` |

Plugin catalogs are hand-authored from the plugin manifest; `@plumix/admin` is Lingui-extracted from source. A locale is "complete" when it covers all six. The maintainer flips `enabled: true` in the registry once coverage meets the quality bar — no automated threshold.

## Adding a new locale

1. Pick a code from BCP-47 (`uk`, `ar`, `pt-BR`, `zh-Hans`, …). Match a code already supported by Lingui's plural rules — see [Lingui locales](https://lingui.dev/ref/locale).
2. Copy `en.po` to `{code}.po` in each of the six packages.
3. Fill in `msgstr ""` for each entry. Leave `msgid` and `msgctxt` untouched.
4. Verify locally:

   ```sh
   pnpm i18n:check       # source ↔ catalog drift across all packages
   pnpm i18n:extract     # admin only — regenerates from current source
   pnpm i18n:compile     # builds the runtime catalog files
   pnpm dev              # smoke-test in the admin UI with ?lang={code}
   ```

5. Open a PR. The CI gates `i18n` and `i18n ratchet` must pass.

## How to read a `.po` entry

```po
#. context for translator: post type singular name
#: src/admin/MenusShell.tsx
msgctxt "post type singular name"
msgid "plugin.blog.post.singular"
msgstr "Post"
```

- `#.` — translator comment. Explains placeholders (`{name}` = "the user's display name") or context. Read it.
- `#:` — source location. Where the string surfaces. Useful for finding the screen.
- `msgctxt` — semantic disambiguator. The same English word can have two `msgid`s if it means different things (e.g. `Trash` as a status noun vs. as a verb). Translate each `msgctxt` independently.
- `msgid` — the source string OR an explicit id like `plugin.blog.post.singular`.
- `msgstr` — your translation goes here.

## Placeholders and pluralization

ICU MessageFormat. Common shapes:

```po
# Simple placeholder — translate around the {name} token verbatim.
msgid "Welcome, {name}"
msgstr "Bienvenido, {name}"

# Plural form — adjust the cases to your locale's plural rules.
msgid "{count, plural, one {# revision} other {# revisions}}"
msgstr "{count, plural, one {# revisión} other {# revisiones}}"
```

Slavic locales (`uk`, `ru`, `pl`) use four plural cases (`one`, `few`, `many`, `other`); Lingui's `Intl.PluralRules`-backed runtime picks the right form per number. Arabic uses six. Adjust the cases — don't drop any.

## RTL locales

For RTL languages (`ar`, `he`, `fa`, `ur`), plumix's runtime sets `<html dir="rtl">` and Radix's `DirectionProvider` flips chrome automatically. Translate naturally; the layout takes care of itself. After completing the catalog, smoke-test every admin route — RTL regressions surface during real navigation, not via unit tests.

## Catalog drift

The `pnpm i18n:check` gate fails if source adds a new descriptor without a matching `msgid` in `en.po`. The engineering team owns updating `en.po`; ping in the PR if you spot the gap. The gate reports both directions:

- `+ msgid` — declared in source, missing from `en.po`. Translators won't see it.
- `- msgid` — present in `en.po`, no source declaration. Orphaned translation work.

To preserve a translation for a string that was removed from source, mark its entry obsolete with `#~ msgid "..."`. The gate skips obsolete entries, so the translation stays in the file without tripping orphan detection.

## Where to ask

Translation questions land in the PR review. Architecture and process: open a GitHub Discussion before starting on a sizeable locale (admin core alone is ~640 strings).
