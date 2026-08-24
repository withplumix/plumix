---
"@plumix/blocks": patch
---

Puts a floor under `blocks.htmlAllowlist.schemes` so an override cannot re-admit a script-capable URL
scheme.

`schemes` replaces the baseline instead of extending it — deliberately, since `schemes: []` is how an
operator locks the surface down — but nothing bounded the replacement in the other direction, so
`schemes: ["javascript"]` was enough to make `<a href="javascript:alert(1)">` survive sanitizing on
the server. No tag the baseline does not already allow is needed for that. `javascript`, `vbscript`,
`data`, `blob` and `view-source` are now dropped from the built allowlist whatever the config says —
the schemes `renderer/link.tsx` refuses to make clickable, plus the wrapper they hide behind.

Two operator-visible consequences. Override schemes are now lowercased, which makes the two sanitizer
engines agree: `sanitize-html` compares the list verbatim while the DOMPurify shim the browser build
uses lowercases it, so `schemes: ["HTTPS"]` used to drop every link on the server and render fine in
the editor. Config that previously failed closed this way now takes effect. And an override that
listed `data` to inline data-URI images loses them — that setup only ever half-worked, since
DOMPurify strips `data:` on its own regardless, so the images rendered on the server and vanished in
the editor. Per-attribute scheme scoping is the shape of a fix there, not a hole in the floor.

Nothing was exploitable in the editor: DOMPurify rejects the dangerous schemes on its own URI regexp
whatever the allowlist says. Nor in production — a site had to opt in through `blocks.htmlAllowlist`,
and that override does not reach the renderer yet. This closes the gap before it is wired up.
