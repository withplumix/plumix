---
"@plumix/core": minor
---

Add access policies and a hard gate for theme-facing routes.

Declare who may see a route or entry type as a resolver over the current
visitor that returns a discrete outcome — a segment plus a gate decision. The
framework enforces it: an anonymous visitor to an authenticated-only page is
redirected to sign in (and returned afterwards), and an under-privileged visitor
to a role-gated page is denied.

```ts
import { definePolicy, grant, redirectToLogin, challenge } from "plumix";

const membersOnly = definePolicy({
  segments: ["members"],
  resolve: (ctx) =>
    !ctx.user               ? redirectToLogin()
  : !hasActiveSub(ctx.user) ? challenge("subscribe")
  :                           grant("members"),
});
```

Attach a policy at the entry-type level (`access.default`, gating a type's
single and archive routes) or on a custom archive; the built-in
`anonymousPolicy` / `authenticatedPolicy` / `rolePolicy` cover the common cases.
The decision logic is unconstrained (role, a `meta` flag, an external check),
but the return shape is closed, so the gate stays sound. `auth({ loginPath })`
points sign-in at a theme-owned page.

Un-policied routes are unchanged. A policied page renders live in this release;
keying the edge cache on the segment is a follow-up.
