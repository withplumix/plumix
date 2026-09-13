---
"@plumix/admin": patch
---

Fixes the admin manifest normalizer silently dropping `dashboardWidgets` and
`breakpoints` from the `#plumix-manifest` wire payload. Plugin-registered
dashboard widgets now actually appear on the admin dashboard, and
theme-configured breakpoints now reach the editor instead of always falling
back to the defaults. The normalizer's field allowlist is now derived from an
exhaustive, typechecked mapping over `PlumixManifest` so a future field can't
be added to the wire shape without the normalizer learning about it.
