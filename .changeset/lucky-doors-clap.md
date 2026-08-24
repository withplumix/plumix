---
"@plumix/blocks": patch
---

Puts a floor under `blocks.htmlAllowlist.extraAttributes` so an override cannot grant a tag an event
handler or a `style` attribute.

`extraAttributes` was merged onto the baseline verbatim, with no name ever rejected, so
`extraAttributes: { p: ["onclick"] }` was enough to render `<p onclick="alert(1)">`. This is the half
that needed a floor most: `on*` re-opens script execution on any tag that survives the tag denylist,
`<p>` included, so it needs no element of its own. Handlers are matched by prefix, since the set
grows with every new event.

`style` is denied outright rather than sanitized. Trusting a declaration string means parsing
`prop:val;prop:val` identically in both sanitizer engines, where `sanitizeCssValue` validates a
single value and the styles pipeline it guards receives CSS as structured property / value pairs.
`attrs.ts` denies the attribute on the same grounds.

Attribute names and the tags they hang on must now also be literal — `[a-z][a-z0-9-]*`, the rule
`attrs.ts` already applies to author-supplied attributes. sanitize-html reads an attribute entry as a
glob and a `"*"` tag key as every tag, so `{ "*": ["*"] }` handed back every name the floor rejects
and `"*click"` walked past the prefix test outright. The DOMPurify shim matches both exactly and
expands neither, so those configs sanitized clean in the editor and dirty on the server; refusing the
shape closes the hole and the divergence together. An override that spelled an attribute as a glob
never worked in the editor and now works nowhere.

Names are lowercased before the check, as tag names already were. Both engines honoured a handler
that reached them, and the mixed-case spelling was honoured in the editor alone: DOMPurify lowercases
its allowlist while sanitize-html compares the parsed name against it verbatim.

Nothing was exploitable: a site had to opt in through `blocks.htmlAllowlist`, and that override does
not reach the renderer yet. This closes the last of the three override fields before it is wired up.
