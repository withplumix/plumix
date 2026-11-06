---
"plumix": minor
"@plumix/runtime-cloudflare": patch
---

Removes the role rank ladder; nothing ranks one role above another any more. Removed with no shims:

- `canAccessAdmin` and `STAFF_MIN_ROLE`: check `ctx.auth.can("admin:access")`.
- `ROLE_LEVEL`, `roleLevel` and `CapabilityResolver`'s `requiredRole`: ask whether the principal holds a capability with `ctx.auth.can(capability)`.
- `rolePolicy(role)` and the built-in `role:<name>` segment: gate with `capabilityPolicy(capability)`, which grants the `capability:<name>` segment.
- `registerCapability(name, minRole)` and `registerCapability(name, { minRole, defaultGrants })`: use `registerCapability(name, { grantTo: [...] })`, or no grant for `admin` alone.
- A single role as an entry type's or taxonomy's `capabilities` override, such as `{ delete: "editor" }`: name the receiving roles, `{ delete: ["editor"] }`.
- The `plugin:manage` capability, which guarded nothing. No role holds it.
- `USER_ROLES` and the `UserRole` type from `plumix/schema`: a user's role is any role the config declares. `DefaultRole` from `plumix/auth` names the roles core ships.

`CORE_CAPABILITIES`, `POST_TYPE_CAPABILITY_ACTIONS` and `TERM_TAXONOMY_CAPABILITY_ACTIONS` now map each capability to the default roles that receive it instead of a minimum role. A `user()` field's `.roles()` and `cfAccess({ defaultRole })` accept a role the config declares.
