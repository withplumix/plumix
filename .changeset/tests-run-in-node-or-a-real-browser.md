---
"plumix": minor
---

Runs a plugin's DOM tests in real Chromium, so an admin test can render a component and send a `File` through a stubbed RPC procedure in the same file. Under jsdom the multipart body never survived the trip.

- **Removes `plumix/admin/test` and `plumix/blocks/test`.** Import `stubPluginRpc`, `PluginRpcError`, `renderBlockSpecToHtml`, `renderBlockTreeToHtml`, `mockRegistry` and `EMPTY_CONTEXT` from `plumix/test`, which is now the one test import in both tiers. Its `browser` build exports the same names; a harness that needs Node throws there, naming the export and the `*.test.ts` file it belongs in.
- **Adds `defineTestConfig()` on `plumix/vite`**, a plugin's whole vitest config. A test named `*.test.ts(x)` runs in Node, and one named `*.browser.test.ts(x)` runs in headless Chromium. Install `vitest`, `@vitest/browser-playwright` and `playwright`, which are optional peer dependencies of `plumix`.
- **Adds `fakeFile` and `fakeImage` on `plumix/test`**: a real `File` of a given content, size and type, and a valid PNG of a given width and height.

To upgrade, rename each test that renders or touches the DOM to `*.browser.test.tsx`, drop `test.environment` and any jsdom stubs from the vitest config, and move the two removed imports to `plumix/test`.
