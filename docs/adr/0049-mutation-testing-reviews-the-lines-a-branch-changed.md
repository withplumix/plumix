# Mutation testing reviews the lines a branch changed

Most of Plumix is written by agents, tests included, and a test an agent writes
fails in a predictable way: it runs the code and asserts too little. Coverage
cannot see that, since a line that runs counts as covered, and "would it fail
if the behaviour broke?" (`CODING_STANDARDS.md#reviewing-a-test`) was asked only
in a reviewer's head. A spike on core with StrykerJS, then a benchmark over seven
shipped commits, found that kind of gap in reviewed code: a memo key that could
collapse, an access branch no test entered, a sign-in that would pick the first
user. The gaps became #3171–#3174.

> **`pnpm test:mutation` mutates the lines a branch changed, one package at a
> time, runs that package's unit tests against each mutant and prints each
> surviving line once. It reports, never gates: CI does not run it, it sets no
> score, and it is not a tier. A survivor is a question for the author and the
> reviewer, who answer it with a test or a named reason.**

## What this means

- **Changed lines only.** A run costs what the branch touched, and it never
  asks a branch to pay for old gaps. Those are tickets.
- **Signal over coverage.** The TypeScript checker drops mutants that do not
  compile, and `tooling/stryker/arid.ts` drops "arid" code whose mutants no
  useful test catches: logging, error prose, display text, and code that runs
  at import. That follows Google's experience, where suppressing arid code took
  the share of surviving mutants developers found useful from about 15% to
  80–89%. A dismissal that repeats becomes a rule there, never a comment in
  source.
- **A broken run says so.** A survivor that ran no test, or a Stryker failure,
  exits `3`. A tool that reports gaps it never measured wastes the reader's
  time on every line.
- **Unit tier only.** Stryker drives Vitest in Node. An e2e spec or another
  package's suite never runs. The Bun and Node adapters are out: one suite runs on Bun, the
  other calls `process.chdir`, which the runner's worker threads do not allow.

## Considered options

- **A gate with a score threshold** (nuqs's CI compares mutation debt to the
  base, and n8n's script fails below 80% or on any unexplained survivor). Rejected for
  now: a score invites assertions written to kill mutants, and the runner's
  open bugs (stryker-js#6073, #6144, #6213) would block merges on its own
  mistakes. The review question needs a reader, not a threshold.
- **Excluding whole mutator kinds** (nuqs drops string, object, array, arrow,
  block and boolean mutants). Rejected: about half of the spike's real finds
  were string, object or regex mutants, among them the memo keys and the
  sign-in redirect's `vary: cookie`.
- **Mutating whole packages, or the whole repo.** Rejected: core alone is an
  estimated 40,000 mutants, some five hours a run, and most survivors would sit in code
  no branch is changing.
- **`// Stryker disable` comments for dismissals** (n8n). Rejected: a comment
  that names a mutator says nothing to a reader of the code, and a dismissal
  that repeats belongs in a rule that covers every case.

## Consequences

- `CODING_STANDARDS.md#mutation-testing` says how to read and answer a
  survivor, and `docs/agents/testing.md#mutation-testing` how a run works.
- `@stryker-mutator/vitest-runner` 10.0.0 is patched for Vitest 5's test names
  until stryker-js#6214 ships (#6210).
- The ship loop runs it before its review phase and hands the summary to the
  reviewer.

## Sources

- Petrović, Ivanković et al., ["Practical Mutation Testing at Scale: A view from
  Google"](https://homes.cs.washington.edu/~rjust/publ/practical_mutation_testing_tse_2021.pdf)
  (TSE 2021), ["State of Mutation Testing at
  Google"](https://research.google.com/pubs/archive/46584.pdf) (ICSE-SEIP 2018)
  and ["Does mutation testing improve testing
  practices?"](https://arxiv.org/pdf/2103.07189) (ICSE 2021): diff scoping, one
  survivor per line, arid nodes, and coupling to 70% of high-priority bugs.
- Papadakis et al., ["Mutation Testing Advances: An Analysis and
  Survey"](https://mutationtesting.uni.lu/survey.pdf) (2019).
- StrykerJS, [disabling mutants](https://stryker-mutator.io/docs/stryker-js/disable-mutants/)
  and the [Vitest runner](https://stryker-mutator.io/docs/stryker-js/vitest-runner/).
- n8n's `scripts/mutation-health/`, nuqs's `.github/workflows/mutation.yml` and
  akash-network/console's `script/stryker-observability-ignorer.mjs`.
- The benchmark over seven shipped commits (#3050, #3077, #3092, #3096, #3097,
  #3103 and #3122): 52 surviving lines, none of them false when each
  mutant was written into the source by hand and the related tests rerun, and
  identical results on a rerun. A reviewer with no context judged 26 worth a
  test, 6 of them high severity.
