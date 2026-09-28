# A capability is named by what it guards, not spelled

#2394 let an entry type pool its permissions into another type's namespace:
`news` registered with `capabilityType: "post"` is gated by `entry:post:*`, and
`entry:news:*` is never minted. From then on a hand-spelled
`"entry:news:create"` was wrong. It names a capability no role holds, so it
denies everyone.

#2416 fixed the row-dependent edit gate by publishing a predicate,
`canEditEntry`. Every other entry capability was still a string a plugin wrote
by hand: `requireCapability("entry:media:create")`, an admin page's
`capability: "entry:media:read"`, a lookup adapter's gate. The literal was the
only idiom a plugin author could copy, and it could not be correct for a pooled
type. It could not be fixed at the call site either. `requireCapability` runs
at router-build time, before any registry exists to look a namespace up in.

> **An entry or term capability is named by what it guards:
> `entryCapability(type, action)` or `termCapability(taxonomy, action)`. The
> reference is an immutable value, and every public capability slot accepts it
> alongside a string. The registry resolves it where the slot is read, per
> request or at manifest build. Whatever leaves the server is still a
> string.**

## What this means

- **One slot type.** `Capability` is
  `KnownCapability | EntryCapability | TermCapability | (string & {})`.
  `ctx.auth.can`, `requireCapability`, route and REST `auth`,
  `registerLookupAdapter`, `registerAdminPage`, dashboard widgets, meta boxes
  and every field builder's `.capability()` take it.
- **Resolved at the slot, not at registration.** A reference to a type a
  plugin installed later registers still lands in that type's namespace. An
  unregistered type resolves to its own name, the existing fallback.
- **The wire stays strings.** Manifest capabilities, `FORBIDDEN` payloads and
  token scopes carry the resolved string, so the admin keeps comparing strings
  against the session's granted list.
- **The action is typed.** It autocompletes from the resource's action set.
- **Row-dependent rules stay predicates.** `canEditEntry` and `canDeleteEntry`
  answer "may this caller change this row?". A reference answers "which
  capability?".
- **Flat capabilities stay strings.** `comment:moderate` and `settings:manage`
  name no type, so there is nothing to resolve.
- **A lint rule keeps the literal out.** `plumix/no-spelled-capability` rejects
  an `entry:<x>:<action>` or `term:<x>:<action>` literal in production `src/`.
  The module that defines the shape is named through the rule's configuration.

## Considered options

- **A named function per surface** (rejected). `canCreateEntry`,
  `canReadEntry`, `requireEntryCapability`, `entryAdminPage`, and so on. Each
  slot would grow its own entry point, and the next slot would need another.
  One value accepted everywhere covers every slot, including ones that don't
  exist yet.
- **Publish only the by-name resolver** (rejected). Publishing
  `entryCapabilityByName(registry, type, action)` fixes a handler that holds a
  registry. It can't reach the slots filled before one exists: router build,
  `setup`, the admin page table. Those would keep the literal.
- **Resolve at registration** (rejected). This is simpler, but a slot filled
  before the pooling type is registered would freeze the wrong namespace.
  Plugin order would then decide who may do what.
