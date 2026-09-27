# The admin offers only what the deployment can do

The admin nav listed **Mailer** on every site, and its page offered a test send
that could only fail with `mailer_not_configured` when `plumix.config.ts` had no
`mailer` slot. The media library offers an upload with no `storage` slot the same
way (#2516). The login screen offers magic-link sign-in the app never enabled
(#2610). Each time, the admin gated the action on what the user _may_ do, an
RBAC capability, and found out what the deployment _can_ do only when a request
failed.

> **Whether the deployment can do something is decided separately from whether
> the user may. An admin affordance backed by an infrastructure slot is hidden
> when that slot isn't configured. Reactive `*_not_configured` error mapping
> stays as a fallback, never the gate.**

"Capability" stays RBAC-only. A configured slot or an enabled sign-in method is
not a capability, and no capability check stands in for one. An affordance that
needs both asks both questions: the sidebar drops **Mailer** for a user without
`settings:manage`, and for every user on a site without a `mailer` slot.

## Where each answer travels

The two kinds of "can" are known at different times, so they travel on different
channels.

- **Slot presence travels in the plugin manifest.** It is fixed at build time:
  the plumix Vite plugin already holds the resolved `PlumixConfig` when it builds
  the plugin manifest, which already carries `tokens` and `i18n` for the same
  reason (the precompiled admin can't import `plumix.config.ts`). The plugin
  manifest's `configuredSlots` says, per **infrastructure slot**, whether the
  config sets it, and nothing else: no adapter name, binding or option reaches
  the browser. `buildManifest` drops a core nav item backed by an unconfigured
  slot, so the sidebar and the command palette never see it. The admin shell
  publishes the roster on `window.plumix`, and plugin admin code asks
  `isSlotConfigured(slot)` from `plumix/admin`.
- **Sign-in methods travel over the public auth RPC.** The app resolves them at
  runtime, from env the plugin manifest is built before (#2610).

`InfrastructureSlot` names the `plumix()` keys that hold an adapter the admin
could offer an action for: `storage`, `imageDelivery`, `kv`, `cdn`, `mailer`.
The roster covers all five although only `mailer` gates an admin surface today.
A roster that listed only what is read now would have to be revisited by every
ticket that reads a new one. A new key of that kind joins the union, and the
roster fails typecheck until it names it.

## Considered options

- **Gate on the error** (rejected). Map `mailer_not_configured` to localized copy
  and leave the action in place. The user still finds a button, presses it and
  learns it could never work. The mapping stays, for a slot whose adapter fails
  at runtime, but it is not what decides whether the action is offered.
- **Model it as a capability** (rejected). Grant `settings:manage` only where a
  mailer exists. Capabilities map to roles and are resolved per user; slot
  presence is per deployment and the same for everyone. Folding one into the
  other makes both harder to read and gives "capability" a second meaning.
- **Ship the adapter config to the admin** (rejected). The admin needs a yes or
  no. Adapter names, bindings and options are deployment detail the browser has
  no use for, and some of them are secrets.
- **Ask the server at runtime** (rejected for slots). An RPC answer arrives after
  the sidebar has rendered, and the value can't change without a rebuild anyway.
  It is the right channel for sign-in methods, which the build can't know.
