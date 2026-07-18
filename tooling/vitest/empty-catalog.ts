// Stands in for compiled i18n catalogs (`locales/*.mjs`) imported by name under
// vitest, so `test` needs neither `build` nor `i18n:compile` for them. Safe
// because no unit test asserts translated content — the only source that
// statically imports a catalog (core's welcome/ and admin-bar/ screens) falls
// back to its English `message` descriptor for any absent key, so an empty
// catalog renders exactly the English source. Real translations are validated
// by `i18n:check` / `i18n:ratchet`. (Catalogs loaded via `import.meta.glob` —
// admin's `bootI18n` — are a filesystem scan this stub can't reach; those tests
// mock the glob instead. See packages/admin/src/lib/catalog-globs.ts.)
export const messages: Record<string, string | readonly string[]> = {};
