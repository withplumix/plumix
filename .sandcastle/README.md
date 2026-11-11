# Local ship loop

Run from the repository root. Install the harness separately from the workspace:

```bash
pnpm --dir .sandcastle install --frozen-lockfile
pnpm --dir .sandcastle test
pnpm --dir .sandcastle typecheck
```

Copy `.sandcastle/.env.example` to `.sandcastle/.env` and supply the credentials it
names. Build the sandbox image from the repository root:

```bash
.sandcastle/node_modules/.bin/sandcastle docker build-image
pnpm --dir .sandcastle ship
```

`ship` defaults to three lanes and eight hours for dispatching new issues. Existing
PR confirmations finish after dispatch stops. Select issues or change those limits:

```bash
pnpm --dir .sandcastle ship 3450 3451 --lanes=2 --hours=4
```

This runs real agents, pushes branches, opens PRs, and queues merges under the
repository's existing rules. It uses Docker, GitHub, and the configured Claude
account. Only one `ship` coordinator may own this checkout. Other automation
checkouts have separate locks and journals; do not run multiple ship checkouts
against the same issues.

## Journals

Every invocation creates `runs/ship-<timestamp>/events.jsonl`. The timestamp is
milliseconds since the Unix epoch, increasing between runs even when the clock
moves backward. Each line is one JSON event with an ISO `at` timestamp. The journal
is automatic and independent of redirected console output:

```bash
pnpm --dir .sandcastle ship > ship.log 2>&1
```

Events record delivery starts and branch names, tracked PRs, repair and rebase
attempts, completed phases, parked deliveries, and confirmed merges. A phase
event includes its issue number, phase journal ID, timings, model, token usage
when available, and evidence paths. Phase journals retain `run.json`,
`summary.md`, and agent/gate logs in their own run directories. `shipped` in a
phase journal means that operation finished, not that its PR merged;
`delivery.merged` in the ship journal records the merge.

Keep the run directories together. PR repair budgets are reconstructed from
their events, including attempts interrupted after starting. Deleting journals
loses that history. Historical phase journals from before ship journaling are
left untouched; open loop-owned PRs can still be discovered through GitHub.

## Restarting

Run the same `ship` command again. It reads previous ship journals before
dispatching new issues, combines their unfinished deliveries with GitHub's open
loop-owned PRs, and reports recovered work. Selecting issue numbers restricts
recovery and dispatch to those issues.

- Recorded PRs are inspected even if they merged or closed while the process was
  stopped. A confirmed merge completes the delivery. A closed PR is parked for a
  person rather than repaired.
- When a run recorded a branch but stopped before recording a PR, recovery looks
  for a PR on that branch, including merged or closed PRs. It does not create a
  second PR for the issue.
- Repair and rebase attempt counts survive restarts and repeated PR observations.
- Interrupted implementations without a PR resume their branch without resetting
  it. The owner resumes its last recorded Claude session when the transcript still
  exists; otherwise a fresh session inspects the preserved commits and work.
- Repairs preserve leftover worktrees and unpublished local commits and report
  that they need manual recovery instead of resetting them to the remote branch.
- An incomplete final JSONL line is ignored and its file is reported. Earlier
  complete events still apply. A corrupt complete record stops startup and names
  its file and line. Do not rewrite journal history to bypass a failure.

`ship.lock` identifies the owning process. Normal process exit releases it. A
later invocation can reclaim a lock whose process no longer exists; a live
owner prevents startup. Run from a dedicated automation checkout so branch work
does not collide with interactive development.

## PR supervision

The coordinator inspects PRs every two minutes without holding a sandbox. Each
observation records the head, verdict, reason, and next inspection time. Restarting
honours that time and preserves missing-check and merge-queue-drop counters.
Waiting for checks or a reviewer has no arbitrary 45-minute failure deadline.
Human decisions remain pending; code feedback from human and bot review threads
goes to the implementer. Thread and comment pagination preserves the discussion.

The coordinator requests at most one check rerun per issue and head across runs.
Repair and rebase budgets also survive restarts. A final independent review must
approve the exact commit being published, including changes made by gate fixes or
rebases. Repair replies name that commit before resolving addressed threads.
Merge requests check the PR's current state and match its current head; repository
rules still govern approval and merging.
