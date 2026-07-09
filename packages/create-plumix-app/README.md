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
directory must exist. The scaffolder copies the chosen template and
rewrites the new `package.json`'s `name` field to match the target
directory's basename.

See the comments in the generated `plumix.config.ts` and
`wrangler.jsonc` for the few placeholders you'll want to edit before
deploying (Cloudflare account subdomain, D1 database id).

## Templates

Pick a template with `--template <name>` (default: `minimal`). Each
template mirrors an example from the Plumix monorepo:

```bash
pnpm create plumix-app my-blog --template blog
```

- **minimal** — `@plumix/runtime-cloudflare` on D1 with passkey auth and
  a `consoleMailer()` default for development. The smallest working app.
- **blog** — minimal plus `@plumix/plugin-blog`, `@plumix/plugin-pages`,
  and `@plumix/plugin-media`.

## Support

Have a question? Start a [discussion](https://github.com/withplumix/plumix/discussions). Found a bug? [Open an issue](https://github.com/withplumix/plumix/issues).

## Contributing

PRs and ideas welcome. The [Contributing guide](https://github.com/withplumix/plumix/blob/main/CONTRIBUTING.md) gets you set up — new contributors especially welcome.

## License

[MIT](https://github.com/withplumix/plumix/blob/main/LICENSE) © Plumix Contributors
