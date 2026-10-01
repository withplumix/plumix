---
"@plumix/core": minor
---

Removes the `I18nInput`, `LocaleResolverOverride` and `ResolvedI18n` types from the `@plumix/core/i18n` subpath. Import them from `plumix` (or `@plumix/core`), which still exports them unchanged.

`otelConsumer` from `@plumix/core/telemetry-otel` now declares a consumer that reads only `ctx.request` and `ctx.logger`. It still fits `telemetry.consumers` as before.
