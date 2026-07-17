# create-plumix-app

## 0.2.0

### Minor Changes

- [#1393](https://github.com/withplumix/plumix/pull/1393) [`b1cd13f`](https://github.com/withplumix/plumix/commit/b1cd13f9f605860b7255948c19a5cba1c065a63f) Thanks [@nasyrov](https://github.com/nasyrov)! - Scaffold projects by composing a runtime with the plugins you pick, instead of copying a fixed example.

  On a terminal `create-plumix-app my-site` now asks for the project directory, runtime, plugins, and auth methods, then installs dependencies, sets up a local database, and initialises a git repository. Pass flags to skip the wizard entirely:

  ```bash
  pnpm create plumix-app my-site --plugins blog,pages,media
  ```

  - `--runtime <id>` — runtime to target (default: `cloudflare`)
  - `-p, --plugins <ids>` — comma-separated plugins to include
  - `--pm <name>` — package manager (npm, pnpm, yarn, bun); auto-detected
  - `--no-install`, `--no-db`, `--no-git` — skip the matching post-scaffold step
  - `-y, --yes` — accept defaults; with no `--plugins`, scaffolds a blank app

  A blank app is the runtime on D1 with passkey auth — the smallest thing that runs. Each plugin adds its own config, dependencies, and any runtime bindings it needs, so `plumix dev` works immediately after scaffolding rather than failing on a missing database.

  Plugins describe their own scaffolding, so the set offered here follows whatever is published rather than a list baked into the CLI.

  **Breaking:** `--template` is removed. It cloned a whole example; plugins are now selected individually with `-p/--plugins`. Passing it exits with a message pointing at the replacement.

## 0.1.2

## 0.1.1
