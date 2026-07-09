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

- **Versions move in lockstep.** `plumix`, all `@plumix/*` packages, and
  `create-plumix-app` are a `fixed` group — one changeset bumps them all to the
  same version. Pick the bump based on the most significant change in the PR.
- Private packages (playgrounds, examples, the admin app) are released by
  nobody, so they don't need changesets.
- Releases are cut by merging the automated **"Version Packages"** PR; the
  summaries you write become the `CHANGELOG.md` entries, linked back to their PRs.
