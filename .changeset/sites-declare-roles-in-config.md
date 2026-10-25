---
"plumix": minor
---

Adds `roles` to `plumix()`, so a site declares its roles in config. Each role has an optional `label`, an optional `extends` naming a role whose capabilities it adds, and `can`, which groups capabilities by what they guard: `entry` and `term` keyed by entry type and taxonomy, and every other capability by its prefix (`admin: ["access"]`, `comment: ["moderate"]`). Declaring a default role's name replaces its grants, and `admin` can't be declared: it always holds every capability. Actions are type-checked, and `selfSignup.defaultRole`, `allowedDomains` and `extends` accept only a default role or one in `roles`. A grant, entry type, taxonomy or `extends` target that nothing registers fails `plumix build` and dev with a message naming it, and a running site ignores it. A user and an invite can hold a site role, and `user.invite` and `user.update` refuse a role the config doesn't declare.
