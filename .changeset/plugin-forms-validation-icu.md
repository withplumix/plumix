---
"@plumix/plugin-forms": minor
---

Makes the last of the plugin's visitor-facing copy translatable: every rejection a field can
produce, the step counter, and a repeater row's heading and remove button. Ten strings that were
template-literal functions are now ICU messages on descriptors, and `en`, `uk`, `ar`, `de` and
`zh-CN` all carry them.

The row-count messages are why this needed ICU rather than more descriptors. "1 entry" and "3
entries" were built by picking a suffix, which is a rule English happens to follow and Ukrainian and
Arabic do not — so the count now drives an ICU plural, and each catalog spells out the forms its own
language uses: four for `uk`, six for `ar`, one for `zh-CN`. The out-of-range message is a single
`select` rather than three ids, so a translator can see that "between 1 and 9", "5 or more" and "9 or
less" are one sentence with a different tail.

Rendering them reads the compiled source catalog through the package's own `./locales/*` subpath,
the way core's admin bar does, rather than the descriptors' own `message`. That is deliberate:
Lingui installs the parser that would read a raw ICU string only outside production, so on a
deployed site the uncompiled route would put `{label} is required.` in front of a visitor. Compiled,
the ICU is already parsed and no parser ships. A visitor reads the same English as before — the
public render path still has no catalog to resolve against and this does not give it one. What
changes is that the strings are now somewhere a translation can go.
