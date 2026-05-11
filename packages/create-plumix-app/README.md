# create-plumix-app

Scaffold a new Plumix project.

## Usage

```bash
pnpm create plumix-app my-blog
cd my-blog
pnpm install
pnpm dev
```

The target directory must not exist (or must be empty); its parent
directory must exist. The scaffolder copies the bundled `starter`
template and rewrites the new `package.json`'s `name` field to match
the target directory's basename.

See the comments in the generated `plumix.config.ts` and
`wrangler.jsonc` for the few placeholders you'll want to edit before
deploying (Cloudflare account subdomain, D1 database id).

## What's in the starter

`@plumix/runtime-cloudflare` + `@plumix/plugin-blog` +
`@plumix/plugin-pages`, with D1 read-replicas, passkey auth, and a
`consoleMailer()` default for development. Media uploads and nav
menus are not in the default starter — install the relevant plugins
when you need them.
