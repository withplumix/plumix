---
"@plumix/runtime-node": minor
---

Fixes scheduled-run failures going unreported on Node. The generated entry dropped `handler.scheduled`'s return, so the `ScheduledRunReport` the scheduler logs failures from never arrived: a task that threw under `cron: true` said nothing. The entry's orchestration — the portable `{ fetch, scheduled }` pair, the assets → images → site serve chain, the cron start and the shutdown protocol — now lives in `createNodeSite`, and the generated entry is imports and calls. `listener`, `startCron` and the default export keep their shapes. The entry also exports `dispose`, so a host embedding `listener` can drain the site on its own shutdown the way the standalone process does on `SIGTERM`. One quiet difference: the handler is now built on the first request or firing rather than when cron starts, so a process that starts cron and receives neither has nothing for `dispose()` to release.
