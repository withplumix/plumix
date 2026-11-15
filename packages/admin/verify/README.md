# verify:admin

Shows an admin page as it runs on a real site, as a given role. It boots a playground the way its
e2e suite does, signs in a new user of the role without a sign-in flow, opens the page, and writes
what it saw. Run it from the repository root, after `pnpm build`, since the playground serves the
built admin and packages.

```bash
pnpm verify:admin --site <playground> --as <role> --open <route|page-id> [--expect-route <route>] [--seed <n>] [--video] [--out <dir>]
pnpm verify:admin --list [--site <playground>]
```

| Flag             | Meaning                                                                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--site`         | `core` for `packages/core/playground`, or a plugin's folder name for `packages/plugins/<name>/playground`.                                               |
| `--as`           | A role the site declares: the defaults (`member`, `author`, `editor`, `admin`) and the config's own.                                                     |
| `--open`         | A page id from `--list`, or a route under the admin starting with `/`, such as `/entries/posts/1/edit`.                                                  |
| `--expect-route` | The route the page must end on, or the run fails. Defaults to the route `--open` names.                                                                  |
| `--seed`         | Writes that many published entries of each entry type, and terms of each taxonomy, the sidebar lists, then runs the playground's seeder, before opening. |
| `--video`        | Also records the run to `video.webm`.                                                                                                                    |
| `--out`          | Where the files go. Defaults to `.cache/verify-admin/<site>/<page-id>-<role>/`.                                                                          |
| `--list`         | Prints each admin page of the site, or of every playground: its id, route, the capability it needs and who can open it.                                  |

It writes `desktop-light.png`, `desktop-dark.png` (1280×800) and `phone-light.png` (390 wide), each
a full page from a fresh load, and `report.json`:

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
  "axeViolations": []
}
```

`finalUrl` shows where the page ended up. When that is another route than the one opened, query
aside, `redirected` names both, and the summary prints them on their own line. A route that only
redirects, such as `/profile` to `/users/:id/edit`, is not a redirect when it lands on its target;
`ROUTE_ALIASES` in `src/lib/route-aliases.ts` lists them. With `--seed`, `seeded` lists what the
playground's seeder wrote, by kind. The console and network entries cover all three loads; axe scans
the desktop page in light mode against WCAG 2.1 AA, as the admin's e2e suite does. The command exits
`1` when the page ends away from `--expect-route`, or the report holds a console error, a failed
request or an axe violation, and `2` on a flag it can't use.

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

## Tests

`page-list.test.ts`, `report.test.ts` and `route.test.ts` are unit tests. The specs run in the
admin's e2e suite as the `verify-admin` project: `verify-admin.spec.ts` runs the command against
core's and media's playgrounds, and `page-list-walk.spec.ts` opens every page the seo playground
lists as `admin`.
