# verify:admin

Shows an admin page as it runs on a real site, as a given role. It boots a playground the way its
e2e suite does, signs in a new user of the role without a sign-in flow, opens the page, and writes
what it saw. Run it from the repository root, after `pnpm build`, since the playground serves the
built admin and packages.

```bash
pnpm verify:admin --site <playground> --as <role> --open <route|page-id> [--seed <n>] [--video] [--out <dir>]
pnpm verify:admin --list [--site <playground>]
```

| Flag      | Meaning                                                                                                                 |
| --------- | ----------------------------------------------------------------------------------------------------------------------- |
| `--site`  | `core` for `packages/core/playground`, or a plugin's folder name for `packages/plugins/<name>/playground`.              |
| `--as`    | A role the site declares: the defaults (`member`, `author`, `editor`, `admin`) and the config's own.                    |
| `--open`  | A page id from `--list`, or a route under the admin starting with `/`, such as `/entries/posts/1/edit`.                 |
| `--seed`  | Writes that many published entries of each entry type, and terms of each taxonomy, the sidebar lists, before opening.   |
| `--video` | Also records the run to `video.webm`.                                                                                   |
| `--out`   | Where the files go. Defaults to `.cache/verify-admin/<site>/<page-id>-<role>/`.                                         |
| `--list`  | Prints each admin page of the site, or of every playground: its id, route, the capability it needs and who can open it. |

It writes `desktop-light.png`, `desktop-dark.png` (1280×800) and `phone-light.png` (390 wide), each
a full page from a fresh load, and `report.json`:

```json
{
  "site": "core",
  "role": "admin",
  "route": "/users",
  "finalUrl": "http://localhost:53709/_plumix/admin/users?page=1&role=all",
  "consoleErrors": [],
  "consoleWarnings": [],
  "failedRequests": [],
  "axeViolations": []
}
```

`finalUrl` shows where the page ended up, so a redirect away from a page the role may not open is
visible. The console and network entries cover all three loads; axe scans the desktop page in light
mode against WCAG 2.1 AA, as the admin's e2e suite does. The command exits `1` when the report holds
a console error, a failed request or an axe violation, and `2` on a flag it can't use.

The page list comes from the site's own config: its plugins are installed into a registry and
`buildManifest` projects the pages, so a page a plugin adds shows up without anyone listing it.

Each run wipes and migrates the playground's local state, as its e2e suite does, so don't run it
against a playground whose dev server or e2e suite is running.

## Tests

`page-list.test.ts` and `report.test.ts` are unit tests. The specs run in the admin's e2e suite as
the `verify-admin` project: `verify-admin.spec.ts` runs the command against core's playground, and
`page-list-walk.spec.ts` opens every page the seo playground lists as `admin`.
