---
"@plumix/plugin-og": minor
"@plumix/core": minor
"plumix": minor
---

Adds two development-only surfaces to the OG plugin. `/_plumix/og/preview` renders every declared
card rule against sample data, one card per rule at `/_plumix/og/preview/<n>.<ext>`, listed in the
order a page resolves against them rather than the order they were declared in. It reads nothing
from storage and caches nothing, so a refresh re-renders and an edit shows up; that bypass is a
requirement rather than a convenience, since a served card is content-addressed and every edit otherwise lands on a different
URL with the previous render sitting immutable in the bucket. The sample data is invented rather
than looked up, so the preview works on a site with no content in it, and a rule's matcher
contributes the names it narrows on.

A debug-bar panel answers the second question a card author asks. Four links resolve a page's
`og:image` and the rendered markup says nothing about which of them won, so the panel names it — the explicit `.ogImage()`
role, the entry's featured photo, the card and the rule that produced it, or the site-wide default
— along with the reason there is no card on the page. That is where a renderer whose format
scrapers cannot read is reported, which is why no boot-time warning exists for it.

Both surfaces sit behind the `PLUMIX_DEV` gate and a dynamic import, the same shape core uses for
its own dev-only routes, so neither leaves anything in a production build.

Makes `debug_bar:panels` a hook a plugin can actually name. Its declaration was outside the closure
the package barrel anchors, so nothing outside core could subscribe to it however clearly the docs
said otherwise; core now anchors it and exports the bar's presentational primitives
(`DebugSection`, `DebugKV`) so a contributed panel reads like the ones core registers.
`ruleLabel` joins `resolveRule` on the public surface, and the `isJsonObject` and `isJsonArray`
guards join the `JsonValue` type they narrow.
