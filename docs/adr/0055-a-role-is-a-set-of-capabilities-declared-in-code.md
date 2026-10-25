# A role is a set of capabilities declared in code

Every user sat on a fixed ladder of five roles, and a capability belonged to a rung
and everything above it. A site could not add a role that edits pages but never
publishes, nor take one capability away from `editor`. The docs described the fix
as roles stored in the database and merged with config. We decided against storing
them (#3359). WordPress writes roles to the database once and then ignores the code
that declared them, and Statamic's choice of a file _or_ the database splits one
fact across two homes. A role that lives in code is reviewed, versioned and deployed
with the rest of the site.

> **A role is a named set of capabilities, declared in the site's config under
> `roles`. Core ships the default roles, and a config entry with a default's name
> replaces its grants. `admin` can't be declared and always holds every registered
> capability. Nothing ranks one role above another. A user holds one role, named in
> the user's role column.**

## What this means

- **One home.** There is no roles table, no roles RPC and no screen for editing a
  role. The admin assigns roles; it never changes what they grant.
- **Grouped by what they guard.** A role's `can` keys `entry` and `term` by entry
  type and taxonomy, with the actions of
  [ADR 0022](0022-a-capability-is-named-by-what-it-guards.md), and groups every
  other capability by its prefix (`admin`, `user`, `settings`, a plugin's).
  `extends` names a role whose capabilities it adds.
- **Capabilities are derived, roles grant them.** Registering an entry type or a
  taxonomy still creates its capabilities. A plugin names the default roles that
  receive a capability it registers with `grantTo`; without it only `admin` does.
  A role the site adds receives only what its `can` and `extends` grant.
- **`admin` holds everything.** It resolves to every registered capability,
  including one a plugin adds later, so no config can lock every user out.
- **Typed without codegen.** Actions and core groups are literal unions, entry type
  and taxonomy keys autocomplete the known names and accept any other, and
  `plumix()` types role names in `selfSignup.defaultRole`, `allowedDomains` and
  `extends` from the `roles` it is given. Nothing needs `declare module`.
- **Unknown names fail the build, not the site.** A grant, entry type, taxonomy or
  `extends` target nothing registered fails `plumix build` and dev with a message
  naming it. The running resolver ignores it, so a removed plugin degrades a role
  instead of taking the site down.
- **The role column is free text.** A stored role the config no longer declares
  holds no capabilities.

## Considered options

- **Roles stored in the database, merged with config.** Rejected: two sources of
  truth for who may do what, and the merge order becomes a policy of its own.
- **Several roles per user.** Out of scope. One role column stays; `extends` covers
  the combinations a site needs.
