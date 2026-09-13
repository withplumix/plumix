---
"@plumix/core": minor
---

Adds the firing `AppContext` as the last argument of every core lifecycle action — `entry:*`, `term:*`, `user:*`, `settings:group_changed`, `credential:*`, `session:*`, `api_token:*` and `device_code:*` — and of the `rpc:settings.get:output` and `rpc:settings.upsert:output` filters, so a handler reads the context from its arguments instead of calling `tryGetContext()`. Handlers that ignore the new argument keep working; code that fires one of these hooks itself must now pass the context.
