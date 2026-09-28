# Tests run in Node or in a real browser

A plugin could not test an upload (#2432). When an RPC input carries a `File`,
oRPC's link posts `multipart/form-data`. Under vitest's jsdom environment that
body never survived the trip: vitest converts a jsdom `Blob` or `FormData` for
Node's `fetch` by reading a private jsdom field, which jsdom 28 renamed, so the
bytes arrived as the string `"undefined"`, and every `File` was re-wrapped as a
`Blob` named `"blob"`. The call failed as oRPC's `Malformed request` before any
stub could see it. vitest 5.0.2 repairs the bytes on jsdom 29 only, jsdom 30
breaks the conversion again (vitest-dev/vitest#11336), and no version keeps the
filename.

The environment was the fault, and it had a second cost. Every package with one
DOM test set `environment: "jsdom"` for the whole package, so its server suites
ran under a simulated browser too, and each package carried stubs for what
jsdom leaves out: pointer capture, `scrollIntoView`, `ResizeObserver`,
`matchMedia`, `Range` measurement.

> **A test runs in one of two tiers, and its filename picks the tier.
> `*.test.ts(x)` runs in Node. `*.browser.test.ts(x)` runs in headless Chromium
> through vitest's browser mode. Neither tier simulates a DOM. `plumix/test` is
> the one test import, and it serves both.**

This is the split Laravel draws, and Pest 4 draws it with Playwright too:
feature tests run in the language's own process, and a browser test drives a
real browser. A simulated DOM sits between the two and is faithful to neither.

## The tiers

- **Node** is for server code, routes, RPC, hooks, pure logic, and rendering to
  a string. The dispatcher and RPC harnesses and the test databases live here.
- **Chromium** is for anything that renders into a DOM or touches a browser
  API. `fetch`, `FormData`, `File`, `Blob` and `FileReader` all come from the
  one page, so a `File` sent through `stubPluginRpc` arrives as a `File` with
  its name, type and bytes, and a returned `Blob` comes back whole.
- **`*.build.test.ts`** stays the third, separate run (`test:build`). Neither
  unit tier picks it up.
- **Nothing sets an environment.** No vitest config sets `test.environment` and
  no test file carries an `@vitest-environment` docblock. `jsdom` and
  `happy-dom` are gone from every manifest and from the catalog, and no setup
  file stubs a browser API.
- **The browser tier runs client code as it ships**: a 1440×900 viewport, and
  the defines the `plumix` Vite plugin substitutes into a production client
  build, so `process.env.PLUMIX_DEV` is a literal rather than a read off a
  `process` that does not exist.
- **`pnpm test:unit` still needs no build.** The source resolver maps a
  package's `browser` export condition and its `browser` field (`sanitize-html`
  → the DOMPurify shim) to source, the same way it maps `dist` to `src`.

The tier globs reach the whole package (`**/*.test.{ts,tsx}` and
`**/*.browser.test.{ts,tsx}`). Vitest concatenates a config's own `include`
onto each project's, so a package that added a root for its tests would feed
them to both tiers. A package narrows with `exclude` instead.

## One test import

`plumix/test` carries a `browser` export condition that points at a second
build. Both builds export the same names and are typed by the Node build's
declarations, so an import is the same line in either tier. In the browser
build a Node-only export — the dispatcher and RPC harnesses, the test
databases, the WebAuthn fixtures — throws when called, naming itself and the
fix: "`<name>` runs in Node — this test belongs in a `*.test.ts` file, not
`*.browser.test.tsx`." A test holds the two builds to the same names.

`stubPluginRpc` and `PluginRpcError` moved in from `plumix/admin/test`, and the
block render helpers from `plumix/blocks/test`; both subpaths are gone. The
stub takes core's RPC stub from `@plumix/core/test/browser`, a browser-safe cut
of core's test surface, so it serves both builds. `fakeFile` and `fakeImage`
are Laravel's upload fakes: a real `File` of a given content, size and type,
and a valid PNG of a given size built without a Node built-in.

A plugin's whole vitest config is `defineTestConfig()` from `plumix/vite`. This
repo's shared base cannot import `plumix`, so it builds the same projects from
its own table, and a test in `plumix` holds the two equal.

`plumix/test-tier` holds the line. It reports an `@vitest-environment`
docblock, a vitest config that sets `test.environment`, and a DOM import or a
read of `document`, `window`, `navigator`, `localStorage` or `sessionStorage` in
a test not named `*.browser.test.*`. A `typeof` probe stays allowed, because
that is how server-rendering code asserts the DOM is absent.

## Measured

- **admin-editor in Chromium with every jsdom stub removed**: 640 of 642 passed
  in 8.7s, against 12.3s under jsdom (triage). The two that failed only did so
  in a real layout. One drove its pointer at coordinates that assumed a 0×0
  iframe; aimed at the slot's real position it confirms the pass-through #1135
  designed. The other printed the runner's own platform, and now names one.
  After the migration all 644 pass in 9.5–9.7s beside a second suite, and the
  slowest test is 419ms where 22 used to pass 1000ms, so the package's 15s
  `testTimeout` is gone.
- **The blocks DOMPurify shim and island-element suites in Chromium**: all 47
  tests pass. Under happy-dom, `<script>` got through the sanitizer.
- **A `File` round-trip through oRPC's real `RPCLink` and `RPCHandler` in
  Chromium**: `instanceof File`, `name`, `type` and bytes hold, and a returned
  `Blob` arrives intact. `plumix/test`'s stub suite runs the same cases in both
  tiers, and media's browser suite renders its library and sends a file in one
  file.
- **The migration** moved 100 test files to the browser tier. Every other test
  stayed in Node. A few had only borrowed a DOM, or sat in a DOM suite without
  needing one: a markup check that built a `<div>` to read a form's controls,
  and source-reading and lockfile checks. They were split rather than moved.

## Considered options

- **Node's `Blob`, `File` and `FormData` as jsdom's globals** (rejected). One
  realm for the body, but `new FormData(formElement)` breaks and 8 comment
  island tests failed; jsdom's `FileReader` and XHR reject Node blobs.
- **A plumix-owned body conversion under jsdom** (rejected). Whatever Node's
  `fetch` decodes comes back a Node-realm object, so `instanceof File` fails
  against jsdom's global, and it needs a hand-written multipart encoder.
- **Waiting for vitest** (rejected). The fix lands for one jsdom version at a
  time, and none keeps the filename.
- **happy-dom** (rejected). Its `fetch`, `File` and `FormData` share a realm, but
  its `Request` applies browser forbidden-header rules and drops `Origin` and
  `Cookie`, failing the server suites that run beside a DOM test with 401s and
  403s, and its HTML parser let `<script>` through the sanitizer.
- **A per-file `@vitest-environment node` opt-out** (rejected). It keeps a
  simulated DOM as the default, and an upload test still cannot render the
  component it tests.
