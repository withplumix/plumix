---
"@plumix/blocks": patch
---

Denies the parser context-switching tags in the raw-HTML allowlist, and matches the denylist
case-insensitively.

`HARD_DENYLIST` is what keeps `blocks.htmlAllowlist` from re-opening a surface the baseline closes.
It covered the elements that execute, navigate or load a subresource, and `svg` and `math` for
switching the parser into foreign content — but not the rest of that second family: `noscript`,
`template`, `title`, `xmp`, `noembed`, `noframes`, `plaintext` and `annotation-xml`. Sanitized output
is re-parsed, since `core/html` and `core/rich-text` both hand it to `dangerouslySetInnerHTML`, and a
tag whose children are raw text on the sanitizer's pass and markup on the browser's is the
mutation-XSS shape — which is why `svg` and `math` were listed to begin with. `frame`, `frameset` and
`applet` join the first family for the same reason its other members are there.

The list was also compared verbatim, so `extraTags: ["IFRAME"]` passed the check. That was inert
under `sanitize-html` on the server, which lowercases parsed tag names before matching, but the
browser build sanitizes through DOMPurify, which lowercases the allowlist instead — so the mixed-case
spelling was honoured there. Override tags and `extraAttributes` keys are now lowercased before the
check.

Nothing was exploitable: a site had to opt in through `blocks.htmlAllowlist`, and that override does
not reach the renderer yet. This closes the gaps before it is wired up.
