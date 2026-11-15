# verify:admin

Shows an admin page as it runs on a real site, as a given role. It boots a playground the way its
e2e suite does, signs in a new user of the role without a sign-in flow, opens the page, and writes
what it saw. Run it from the repository root, after `pnpm build`, since the playground serves the
built admin and packages.

```bash
pnpm verify:admin --site <playground> --as <role> --open <route|page-id> [--expect-route <route>] [--seed <n>] [--steps <file>] [--video] [--out <dir>]
pnpm verify:admin --list [--site <playground>]
```

| Flag             | Meaning                                                                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--site`         | `core` for `packages/core/playground`, or a plugin's folder name for `packages/plugins/<name>/playground`.                                               |
| `--as`           | A role the site declares: the defaults (`member`, `author`, `editor`, `admin`) and the config's own.                                                     |
| `--open`         | A page id from `--list`, or a route under the admin starting with `/`, such as `/entries/posts/1/edit`.                                                  |
| `--expect-route` | The route the page must end on, or the run fails. Defaults to the route `--open` names.                                                                  |
| `--seed`         | Writes that many published entries of each entry type, and terms of each taxonomy, the sidebar lists, then runs the playground's seeder, before opening. |
| `--steps`        | A script to run on the page once the screenshots are taken. See [Steps](#steps).                                                                         |
| `--video`        | Also records the run to `video.webm`.                                                                                                                    |
| `--out`          | Where the files go. Defaults to `.cache/verify-admin/<site>/<page-id>-<role>/`.                                                                          |
| `--list`         | Prints each admin page of the site, or of every playground: its id, route, the capability it needs and who can open it.                                  |

It writes `desktop-light.png`, `desktop-dark.png` (1280×800) and `phone-light.png` (390 wide), each
a full page from a fresh load, `steps.png` with `--steps`, and `report.json`:

```json
{
  "site": "core",
  "role": "editor",
  "route": "/users/create",
  "finalUrl": "http://localhost:53709/_plumix/admin/users?page=1&role=all",
  "redirected": { "from": "/users/create", "to": "/users" },
  "consoleErrors": [],
  "consoleWarnings": [],
  "failedRequests": [],
  "axeViolations": [],
  "steps": { "passed": 3, "failed": [] }
}
```

`finalUrl` shows where the page ended up. When that is another route than the one opened, query
aside, `redirected` names both, and the summary prints them on their own line. A route that only
redirects, such as `/profile` to `/users/:id/edit`, is not a redirect when it lands on its target;
`ROUTE_ALIASES` in `src/lib/route-aliases.ts` lists them. With `--seed`, `seeded` lists what the
playground's seeder wrote, by kind. The console and network entries cover all three loads; axe scans
the desktop page in light mode against WCAG 2.1 AA, as the admin's e2e suite does. The command exits
`1` when the page ends away from `--expect-route`, or the report holds a console error, a failed
request, an axe violation or a failed step, and `2` on a flag it can't use.

The page list comes from the site's own config: its plugins are installed into a registry and
`buildManifest` projects the pages, so a page a plugin adds shows up without anyone listing it.

Each run wipes and migrates the playground's local state, as its e2e suite does, so don't run it
against a playground whose dev server or e2e suite is running.

## Seeding a plugin's records

Core's factories write entries and terms. A plugin whose records they can't write gives its
playground a `seed.ts` beside `plumix.config.ts`. Its default export takes a Playwright `Page` on
the running admin, signed in as an admin, and the `--seed` count, writes that many of each record,
and returns their names by kind, which the report lists as `seeded`. The media playground's seeder
uploads images through the library, so the files land in the playground's storage as an editor's
would:

```ts
export default async function seed(
  page: Page,
  count: number,
): Promise<Readonly<Record<string, readonly string[]>>> {
  // …upload `count` files…
  return { media: names };
}
```

List the file in the playground's `tsconfig.json` and as a knip entry, since only this command
imports it.

## Steps

A screenshot of a page as it loads can't show what a click does. `--steps <file>` runs a script on
the page once the three screenshots are taken, on a fresh desktop load in light mode, as the same
user. Its default export takes `StepFixtures` from `steps.ts`:

| Fixture   | What it is                                                                                 |
| --------- | ------------------------------------------------------------------------------------------ |
| `page`    | The Playwright `Page`, on the opened route.                                                |
| `context` | Its `BrowserContext`, to grant a permission such as the clipboard.                         |
| `expect`  | Playwright's `expect`. Each assertion that holds counts as a passed step.                  |
| `seeded`  | What the playground's seeder wrote, by kind, as `seeded` in the report; empty without one. |
| `role`    | The `--as` role.                                                                           |
| `site`    | The `--site` playground.                                                                   |

The script stops at the first assertion that fails, or at any other error, such as a click that
times out. `steps.png` shows the page where it stopped, and the report lists the failure with that
screenshot, its message stripped of terminal colours. The summary prints the message in full:

```text
steps      2 passed, 1 failed, at steps.png
  expect(locator).toHaveText(expected) failed

  Locator:  getByTestId('media-detail-copy')
  Expected: "Copy"
  Received: "Copied"
  Timeout:  500ms
```

A playground keeps its step files in `steps/`, listed in its `tsconfig.json` and as a knip entry.
The file imports the fixtures' type by a relative path, since only this command calls it and no
published package carries it:

```ts
import type { StepFixtures } from "../../../../admin/verify/steps.js";

export default async function copyUrl({
  page,
  context,
  expect,
  seeded,
}: StepFixtures): Promise<void> {
  // …act on the page, then assert with `expect`…
}
```

The body is an e2e test's body: `page` and `context` are Playwright's fixtures of those names, and
`expect` is the function a spec imports from `plumix/test/playwright`. Promoting a script to a spec
changes only its parameters. A spec writes its own rows at its start, where a script reads `seeded`,
and signs in through its suite's `storageState`, where a script runs as `--as`.

## Tests

`listening-url.test.ts`, `page-list.test.ts`, `report.test.ts`, `route.test.ts` and `steps.test.ts`
are unit tests. The specs run in the admin's e2e suite as the `verify-admin` project:
`verify-admin.spec.ts` runs the command against core's and media's playgrounds, steps included,
`page-list-walk.spec.ts` opens every page the seo playground lists as `admin`, and `site.spec.ts`
boots the feeds playground while another server takes each port the moment it is free.
