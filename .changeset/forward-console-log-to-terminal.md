---
"@plumix/blocks": minor
"plumix": minor
---

Add an opt-in `log` level to the dev browser-errors-to-terminal forwarder.

The forwarder (#1604) deliberately mirrors only `console.error`/`console.warn`
and uncaught exceptions to the `plumix dev` terminal, because plain logs are
noisy. Setting `PLUMIX_FORWARD_ERRORS=log` now additionally forwards
`console.log`, `console.info`, and `console.debug`, printed through the same
`[browser]`-tagged, sourcemapped, repeat-collapsing path as everything else — so
the verbose case stays on one contract rather than splitting output to Vite's
native `forwardConsole`. The default is unchanged (`warn`), and the whole path
remains dev-only and tree-shaken from production island bundles.
