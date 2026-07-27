# Dev error page — open in editor

In `plumix dev`, an unhandled error renders a full dev error page with the
sourcemapped stack. Each frame carries an **Open in editor** link that hands a
`scheme://…` URL to your editor — a plain anchor, no server round-trip.

## Choosing your editor

The link scheme comes from the `PLUMIX_EDITOR` environment variable. Unset, it
defaults to VS Code, so the link works out of the box.

```bash
PLUMIX_EDITOR=cursor plumix dev
```

Known keys: `vscode`, `vscode-insiders`, `cursor`, `windsurf`, `zed`, `idea`,
`phpstorm`, `webstorm`, `sublime`. Set `PLUMIX_EDITOR=off` (or `none`) to drop
the link entirely.

For an editor without a built-in key, pass a format string carrying `{file}`,
`{line}`, and `{column}` placeholders — it is used verbatim:

```bash
PLUMIX_EDITOR='myeditor://open?path={file}&line={line}&col={column}' plumix dev
```

## Container / remote dev (path remap)

The links use the frame path as the dev server sees it. When the dev server
runs somewhere that doesn't share a filesystem with your editor — a Docker
container, an SSH/remote box, or a devcontainer — that on-server path won't
exist on the editor host, and the link opens nothing.

Set `PLUMIX_EDITOR_PATH_MAP` to a `from=>to` mapping. The `from` prefix (the
path inside the container / on the remote) is rewritten to `to` (the matching
path on your editor's machine) before the link is built:

```bash
# Dev server sees /workspace; the repo lives at /Users/me/proj on your Mac.
PLUMIX_EDITOR_PATH_MAP='/workspace=>/Users/me/proj' plumix dev
```

A frame at `/workspace/src/theme.tsx:12` then links to
`/Users/me/proj/src/theme.tsx:12`. Only the path prefix is remapped, on a path
boundary — `/workspace` rewrites `/workspace/src/a.ts` but leaves
`/workspace-other/a.ts` alone. Paths outside the mapped prefix are left as-is.

On a Windows editor host, write the `to` side with forward slashes
(`/workspace=>C:/Users/me/proj`) — editors accept them, and backslashes would be
percent-escaped in the link.

Like `PLUMIX_EDITOR`, this is read only in `plumix dev`; the whole dev error
path tree-shakes out of production builds.
