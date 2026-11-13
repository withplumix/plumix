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

`ship` defaults to two lanes and an eight-hour run. New issues stop dispatching
with 75 minutes left; PR supervision continues until the deadline. Active agent
calls finish their current phase, then unfinished work stays resumable. Select
issues or change those limits:

```bash
pnpm --dir .sandcastle ship 3450 3451 --lanes=2 --hours=4
```

This runs real agents, pushes branches, opens PRs, and queues merges under the
repository's existing rules. It uses Docker, GitHub, and the configured Claude
account. Only one `ship` coordinator may own this checkout. Other automation
checkouts have separate locks and journals; do not run multiple ship checkouts
against the same issues.

## Journals

Every delivery invocation creates `runs/ship-<timestamp>/events.jsonl`. The timestamp is
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
dispatch and the resumption of unfinished work to those issues; every open
loop-owned PR is still watched and repaired.

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
- A repair that says a failing check is not its branch's is checked against
  main: when main's latest merge-queue run passed that check, the fixer is sent
  back with that run as evidence before the PR parks. The repair's final review
  works like the ship's: one fix round, the decider for a decision, and no block
  on a checklist point.
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
rebases. The review passes before it hold every changed line to the review checklist
in `CODING_STANDARDS.md`, which the implementer also checks before handing over. The
final review blocks only on the spec: a criterion unmet, something it broke, a
requirement with no test, or a PR description the code contradicts. A gap that names a
checklist item is not a block there, so a branch never loops on new style points. Gaps
it finds go back to the fixer for one round, then through the gates and a fresh final
review; a gap no change can close goes to the decider first. A ticket that must wait on
an open issue is marked "Blocked by" it and left for later, not parked. Repair replies name that commit before
resolving addressed threads.
Merge requests check the PR's current state and match its current head; repository
rules still govern approval and merging.

## Analysis and local capacity

An analyst reads the repository and GitHub issue before dependency installation
or builds. The handoff records acceptance criteria, repository evidence, an
ordered implementation plan, and protected paths the implementer must leave
alone. The analyst settles every choice the architecture pages, ADRs, VISION.md
and the surrounding code settle, and asks only what a person must answer: a
secret or account, a security or data-loss trade-off, cut scope, or a product
direction. Missing output, false premises, or such questions stop
implementation. Evidence that cites a file the repository lacks goes back to the
analyst once, then stops implementation. The implementer receives the recorded
handoff.

A stop goes back for clearer instructions before it goes to a person. The
decider reads the stop reason against the spec, ADRs and VISION.md, amends the
brief, and the ticket is taken again on the same branch. The analyst then plans
from the work already there and from every earlier decision. A gap a review
finds that no change to the branch can close goes to the same decider, and the
implementer closes it with the decision in hand. A ticket gets two decisions,
wherever they happen, recorded in the ship journal so a restart keeps the count;
it parks when they run out or when the decider says a person must choose. Two
options the documents leave equally open are not a person's choice: the decider
picks the one that follows the existing pattern and keeps scope. A delivery
resumed after an interruption reuses the brief its analyst already handed over. A
ticket taken again after a park continues on the parked branch when it holds commits:
the analyst plans from that work and the brief's latest decisions, so a late park never
pays to implement the ticket again.

The analyst and the reviewer are read-only: the coordinator discards any edit
they make and runs them again on the same commit, once. Every change comes from
the implementer, so a review's verdict covers the commit that ships.

Implementation, setup, repairs, and decision sessions share the configured total
capacity. Repairs take priority over waiting new work; occupied work finishes its
checkpoint first. The default is two, with per-container Turbo and test workers
bounded for that lane count. Waiting for GitHub holds no execution slot.

A Claude account cooldown is journalled and shared by all lanes. Running calls
finish or report their limit; subsequent calls wait until the latest recorded
reset. Restarting preserves that wait. An unrecognised limit or authentication
failure stops work instead of guessing a reset time.

## Operating the factory

These commands read local files and do not need Docker, GitHub access, or Claude:

```bash
pnpm --dir .sandcastle ship --status
pnpm --dir .sandcastle ship --report
pnpm --dir .sandcastle ship --explain=3450
pnpm --dir .sandcastle ship --help
```

Status shows unfinished deliveries, their last observed reason, used repair and
rebase counts and next check. It is a local snapshot; the next delivery run reconciles
GitHub. Explain prints the issue's chronological events and evidence paths.
Read commands never create a run or acquire the coordinator lock.

Request a running coordinator in this checkout to drain:

```bash
pnpm --dir .sandcastle ship --drain
```

Drain stops new dispatch and wakes pending GitHub or account waits. Active agent
calls reach their next checkpoint. It keeps unfinished deliveries instead of
parking them. Ctrl-C and SIGTERM request the same graceful stop. A drain request
belongs to its coordinator token, so it cannot stop a later run. The process must
remain alive until the checkpoint completes; force-quitting can leave Docker
containers or worktrees that require inspection before restarting.

Console output shows outcomes and waiting reasons. Add `--verbose` for phase
details. Structured journals and agent/gate logs are retained in either mode:

```bash
caffeinate -i pnpm --dir .sandcastle ship --verbose > ship.log 2>&1
```

`caffeinate` keeps the Mac awake during the command. Docker Desktop must remain
running. Use a dedicated checkout, leave `runs/` in place, and start with one issue
before increasing concurrency. This command spends the configured Claude
account's allowance and can queue real merges under GitHub's rules.

## Measurements

The report aggregates completed phase events across runs, including failed
attempts: merge and park counts, merges without a repair, repairs and rebases,
agent errors, gate failures, review passes, active phase time, recorded cooldown
waits, and known API-equivalent cost by phase and model. Explain retains the
underlying log paths and review evidence. A configuration event records the git
revision, prompt hash, Node version, image name and lane count for comparisons.

Usage cursors survive restarts, including resumed owner sessions and subagent
transcripts. Missing transcripts and interrupted agent calls are explicitly
unmeasured. Known dollar totals exclude unmeasured calls and use the rate table
in `lib/telemetry.ts`. They are estimates for comparing work, not actual Claude
subscription charges or a prediction of how many issues the plan will cover.
Parallel phase durations sum work, so they are not elapsed run time.

Compare a small batch of similarly sized issues at one lane and two lanes. Look
at first-pass merges, repair counts, gate failures and agent time alongside
usage. Keep model and prompt hashes with the comparison. No live workload was
used to claim a speedup during implementation.

CI runs this package's own tests and typecheck separately from workspace checks.
The workspace mutation runner does not select this private harness.
