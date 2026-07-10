# Changesets

This folder is managed by [Changesets](https://github.com/changesets/changesets)
— it's how Plumix versions its packages and writes changelogs.

## Adding a changeset

If your PR changes anything a consumer would notice, add a changeset:

```bash
pnpm changeset
```

Pick the bump (patch / minor / major) and write a one-line, user-facing summary.
That creates a markdown file here; commit it with your PR.

## Notes

- **The framework versions in lockstep.** `plumix`, `create-plumix-app`, and the
  internal `@plumix/{core,blocks,admin,admin-editor,admin-ui}` packages are a
  `fixed` group — one changeset bumps them together to the same version.
- **Plugins and the runtime adapter version independently.** `@plumix/plugin-*`
  and `@plumix/runtime-cloudflare` are outside the fixed group — select the
  specific package, and a plugin/adapter fix ships with no framework release.
- Private packages (playgrounds, examples, the `tooling/*` configs) are released
  by nobody, so they don't need changesets.
- Releases are cut by merging the automated **"Version Packages"** PR; the
  summaries you write become the `CHANGELOG.md` entries, linked back to their PRs.
