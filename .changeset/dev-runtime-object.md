---
"plumix": minor
---

Moves dev-only runtime state under one `dev` object: `app.debugHistory` / `ctx.debugHistory` become `app.dev.history` / `ctx.dev.history`, `ctx.dev` now holds the resolved dev config (`bar`, `panels`, `history`) instead of the raw `dev` input (read `app.config.dev` for that), and `app.devCsrfLocalhost` is removed: the dev-server relaxations key on `app.dev` being present.
