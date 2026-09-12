---
"@plumix/runtime-node": minor
---

Fixes scheduled-run failures going unreported on Node, and moves the entry's orchestration into a compiled module. The generated entry dropped `handler.scheduled`'s return, so the `ScheduledRunReport` the scheduler logs failures from never arrived: a task that threw under `cron: true` said nothing. `createNodeSite` now owns the portable `{ fetch, scheduled }` pair, the assets → images → site serve chain, the cron start and the shutdown protocol — type-checked, linted and covered — and the generated entry is imports and calls only. Behaviour is otherwise unchanged; `listener`, `startCron` and the default export keep their shapes.
