---
"plumix": minor
---

Adds the sync routes a deployed site answers `plumix sync` through: `GET /_plumix/api/v1/system/sync/heads`, `GET …/export?scopes=…`, `POST …/import?scopes=…&dryRun=…` and `POST …/snapshot`, each needing an API token whose user holds `settings:manage`. An import is all or nothing, and a dump at other migration heads is refused before anything is written. `plumix sync` and `plumix import` take `--token`, else `PLUMIX_API_TOKEN`, else the device flow on a terminal. Breaking: `OpenSyncEndOptions` has a new required `apiToken: () => Promise<string>`, so a runtime adapter's `RuntimeSync.open` must accept it and anything calling `open` must pass it. The scope errors `PlumixCliError.syncUnknownScope` and `syncScopeRequires` are now `SyncError`s with the same codes. A `database:` slot may offer `openSync(env)` for the routes; without it they answer 501.
