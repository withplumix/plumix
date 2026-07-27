---
"@plumix/blocks": minor
"@plumix/core": minor
"plumix": minor
---

Adds an open-in-editor path remap for container and remote dev servers.

The dev error page's "Open in editor" links use the file path as the dev server
sees it, which doesn't exist on your machine when the server runs in a container,
a devcontainer, or on a remote/SSH box. Set `PLUMIX_EDITOR_PATH_MAP` to a
`from=>to` mapping (e.g. `/workspace=>/Users/me/proj`) and the on-server path
prefix is rewritten to the editor-host path before each link is built, so the
links open the right file. Only the path prefix is remapped, on a path boundary;
paths outside it are left untouched. Like `PLUMIX_EDITOR`, it is read only in
`plumix dev` and tree-shakes out of production builds.
