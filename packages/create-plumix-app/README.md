# create-plumix-app

Scaffold a new Plumix project.

## Usage

```bash
pnpm create plumix-app my-app
cd my-app
pnpm install
pnpm dev
```

The target directory must not exist (or must be empty); its parent
directory must exist. On a terminal the scaffolder runs an interactive
wizard; pass flags (or `-y`) to skip it.

See the comments in the generated `plumix.config.ts` and
`wrangler.jsonc` for the few placeholders you'll want to edit before
deploying (Cloudflare account subdomain, D1 database id).

## Composition

The scaffolder assembles a project from a runtime plus any plugins you
pick, rather than cloning a fixed template. Choose them in the wizard, or
non-interactively with flags:

```bash
pnpm create plumix-app my-blog --plugins blog,pages,media
```

- `--runtime <id>` — runtime to target (default: `cloudflare`).
- `-p, --plugins <ids>` — comma-separated plugins to include.
- `--pm <name>` — package manager (npm, pnpm, yarn, bun); auto-detected.
- `--no-install`, `--no-db`, `--no-git` — skip the matching post-scaffold step.
- `-y, --yes` — accept defaults; with no `--plugins`, scaffolds a blank app.

A blank app is `@plumix/runtime-cloudflare` on D1 with passkey auth and a
`consoleMailer()` default for development — the smallest working app. Each
plugin adds its config, dependencies, and any runtime bindings it needs.

## Support

Have a question? Start a [discussion](https://github.com/withplumix/plumix/discussions). Found a bug? [Open an issue](https://github.com/withplumix/plumix/issues).

## Contributing

PRs and ideas welcome. The [Contributing guide](https://github.com/withplumix/plumix/blob/main/CONTRIBUTING.md) gets you set up — new contributors especially welcome.

## License

[MIT](https://github.com/withplumix/plumix/blob/main/LICENSE) © Plumix Contributors
