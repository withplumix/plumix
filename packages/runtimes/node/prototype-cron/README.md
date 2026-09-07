# PROTOTYPE — Node cron scheduler (#2246)

Throwaway. Nothing here ships. It exists to answer the three open questions on
[#2246](https://github.com/withplumix/plumix/issues/2246) with evidence instead
of argument, and it found two things the issue did not anticipate.

```bash
node run.mjs all     # cron matcher, schedule derivation, a simulated day, overlap, drain
node guards.mjs      # the decisive one: 4 guard combinations x 5 hazards, real processes
node race.mjs        # 4 processes on one SQLite file, with and without a lease
```

`run.mjs` uses a virtual clock (`clock.mjs`) so a 24-hour simulation is instant
and deterministic while the real async control flow runs unchanged. `guards.mjs`
and `race.mjs` spawn real `node` processes against a real SQLite file — the
questions they answer are about crash and concurrency behaviour, which a fake
cannot answer honestly.

## Verdicts

**Q1 — in-process timer, or an OS cron calling the exported handler?**
**In-process.** Cost is not the discriminator: one externally-triggered firing
of the real built playground costs **110 ms wall time** end to end (measured,
3 runs; 2.4 MB server bundle → app built → `scheduled()` returned), so 288
firings a day is ~32 s of CPU. The discriminator is that an external scheduler
has to be *told* the schedules, and the schedules come from plugins — installing
a plugin silently changes the crontab a deploy needs. That is exactly the
Cloudflare `triggers.crons` byte-match trap, and reproducing it on Node is the
wrong long-term call. Keep the external path supported (the handler already
exports `scheduled`) and make the schedules printable rather than guessable.

**Q2 — where does the no-overlap guard live?** **In the database, as three
composed guards.** See the matrix below. Not a file lock: `plumix/db/libsql`
(Turso) is a documented, supported database for this runtime, so a multi-replica
Node deploy sharing one database exists *today*. The guard has to live where the
data is — which also means it travels to #2249 unchanged and works on D1.

**Q3 — on by default?** **Yes, with no config**, because the guards make N
replicas safe. `node({ cron: false })` for operators driving it externally.

## The guard matrix (`node guards.mjs`)

Two guarantees are in play, and conflating them is the trap:

- **P1** at most one run per (schedule, minute), across every replica
- **P2** no two runs overlap in time, across every replica — what the AC asks for

| | A: two replicas, same minute (P1) | B: self-overlap (P2) | C: cross-process overlap (P2) | D: holder SIGKILLed | E: holder blocks event loop > TTL |
|---|---|---|---|---|---|
| `serial` | **FAIL** | PASS | **FAIL** | PASS | **FAIL** |
| `serial+claim` | PASS | PASS | **FAIL** | PASS | **FAIL** |
| `serial+lease` | PASS | PASS | PASS | PASS | **FAIL** |
| `serial+claim+lease` | PASS | PASS | PASS | PASS | **FAIL** |

E with the lease TTL raised above the block (`E2`): `serial+lease` and
`serial+claim+lease` **PASS**.

- `serial` — one run at a time inside the process. Free, and *sufficient* for
  self-overlap (B). Useless across processes (A, C).
- `claim` — a row recording the last `(schedule, minute)` fired. One atomic
  statement, no TTL, nothing to renew, so nothing to get wrong when a holder
  stalls or dies. Gives P1 (A) but **not** P2 (C): the next minute is a
  different key, so it lets a slow run be overlapped by the next firing.
- `lease` — a row holding an expiry, renewed by a heartbeat. The **only** guard
  that stops C.

### The finding that matters: a heartbeat is a lie on this runtime

`node:sqlite` is **synchronous**. A retention purge deleting many rows blocks
the event loop, so no timer fires, so the heartbeat cannot renew — and the lease
is stolen mid-run. Every guard fails hazard E, lease included. The fix is not a
cleverer lock, it is **a TTL sized well above any plausible synchronous block**
(E2 confirms: 300 ms TTL is stolen during a 900 ms block; 5 s TTL holds). The
price is that a `SIGKILL`ed holder pauses cron for up to one TTL — which is why
`claim` is worth carrying alongside: it is crash-proof and keeps the common
duplicate (two replicas, same minute) impossible even while a lease is in doubt.

## Two things the issue did not anticipate

**1. Cloudflare and Unix disagree about weekday numbers.** CF's day-of-week
field is `1-7` with **1 = Sunday** (Quartz-style) and rejects `0`; Unix cron is
`0-6` with 0 = Sunday. So `0 0 * * 1` means **Sunday on Cloudflare and Monday on
Node**. CF also accepts `L`, `W` and `#`, which a plain Unix parser does not.
Nothing validates a cron string anywhere in the repo today — `auditLog({
retention: { purgeAt } })` is free-form, and the repo's own test uses
`0 0 * * 0`, which Cloudflare would reject outright. Left alone, the default
flip to Node (#2247) silently moves people's purge jobs by a day.

**2. Nothing stops the scheduler at shutdown.** The generated entry's SIGTERM
path calls `handler.dispose()`, which drains deferred work — but a scheduler
would still be free to start a fresh run into that drain.

## Files

| | |
|---|---|
| `cron-match.mjs` | 5-field matcher, UTC. ~90 lines — hand-rolling is viable, no dependency needed. |
| `clock.mjs` | Virtual clock: instant, deterministic 24-hour simulations. |
| `scheduler.mjs` | Variant A: the in-process tick loop, with a pluggable lock. |
| `lease.mjs` | First cut of the TTL lease. Superseded by `guard-child.mjs` — it was re-entrant per holder, so a process could take its own lease twice. |
| `guard-child.mjs` | One replica; guards compose via `serial,claim,lease`. |
| `guards.mjs` / `race.mjs` | The real-process experiments. |
| `fake-app.mjs` | The actual task roster: 2 core, 3 plugin, one of them with no cron. |
