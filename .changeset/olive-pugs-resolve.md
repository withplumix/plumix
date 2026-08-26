---
"@plumix/core": minor
---

Adds `resolveRule` and `resolveErrorRule`, the template-hierarchy precedence
walk generalised over any rule carrying a `tier` and a `match` — targeted
matchers in declaration order, then the node kind's generic tier, then
`fallback`. The rule's payload never entered that walk, so a rule kind whose
payload is not a React component now resolves through the same logic instead of
reimplementing it; the new `TierMatchRule` type names the constraint, and the
resolved rule comes back at the caller's own type. `resolveTemplate` and
`resolveErrorTemplate` are unchanged, and are now these two pinned to
`TemplateRule`.
