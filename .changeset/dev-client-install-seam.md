---
"@plumix/core": minor
"plumix": minor
"@plumix/blocks": patch
---

Install the dev-only client error tools from one core-owned entry point.

The island error dialog, the browser-errors-to-terminal forwarder, and the
compile/import error overlay are now installed from a single browser-safe
`@plumix/core/dev-client` export (reached through the `plumix` package as
`plumix/core/dev-client`), which the generated client bootstrap calls behind the
`import.meta.hot` dev gate. `@plumix/blocks`'s island runtime no longer installs
any overlay or forwarder — it only hydrates islands and dispatches the
`plumix:island-*` events the core-installed dialog listens for. The dependency
runs core → blocks (no cycle), and nothing in `@plumix/blocks` outside its
`dev-error/` implementation imports dev-error.

This is behind the existing `PLUMIX_DEV` / `import.meta.hot` gates, so it
tree-shakes out of production exactly as before: an island hydration mismatch
still shows the dialog, a Vite compile error still shows the overlay, and client
errors still forward to the terminal — now all wired from one place.

The `plumix/blocks/dev-error` subpath — an internal wiring seam the generated
client bootstrap used to reach the compile overlay — is removed, since install
now goes through `plumix/core/dev-client`. The dev-error implementations
themselves remain in `@plumix/blocks` and are unaffected.
