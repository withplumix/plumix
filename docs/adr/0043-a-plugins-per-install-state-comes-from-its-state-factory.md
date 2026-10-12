# A plugin's per-install state comes from its state factory

`installPlugins` runs every descriptor's `provides`, then every `setup`, then
every `afterSetup`, and nothing travelled between the three hooks of one
install. A descriptor is a value: the Vite manifest pass and the runtime app
install the same descriptors in one process, and one `forms()` in a shared
config module can boot more than one app. So a closure in the plugin factory is
shared by every install, not owned by one. Forms and SEO each worked around
this by keeping their state in a module-level `WeakMap` keyed by the function
they put on the plugin context, then reading that function back off `ctx` to
find it, behind an `unbound-method` suppression. On a miss forms threw and SEO
returned an empty list (#3023).

> **A descriptor declares its per-install state with a `state` factory.
> `installPlugins` calls it once per install, before any plugin's `provides`
> runs, awaits it, and passes the result as the second argument to that
> descriptor's `provides`, `setup` and `afterSetup`. A descriptor without
> `state` gets `undefined`. State never comes from the factory's closure.**

## What this means

- **Per install, not per descriptor.** Two `installPlugins` calls with the same
  descriptor call its `state` twice and get two states.
- **Private to the plugin.** Core never puts the state on a context, never
  persists it and never shows it to another plugin. Sharing stays explicit,
  through `extendPluginContext` and `extendAppContext`.
- **Typed from the factory.** `definePlugin` infers `PluginDescriptor<TState>`
  from what `state` returns, awaited, and types the three hooks' second
  parameter from it. An author never writes the generic. `TState` replaces the
  `TConfig` parameter `setup` had, which core always passed `undefined`.
- **Errors are the factory's own.** A `state` that throws fails the boot with
  its error, unwrapped, as every other hook does.

## Considered options

- **`provides` returns the state.** Rejected: it ties state to `provides`, so a
  plugin with only `setup` and `afterSetup` would need a `provides` written
  just to return it.
- **An `install()` closure that returns the hooks.** Rejected: every hook moves
  one level deeper, and the descriptor gets two ways to declare its hooks.

## Consequences

- A plugin that keeps anything between its hooks writes `state`, and a module
  `WeakMap` keyed by its own context function is no longer needed for it.
- Plugin state is boot-time memory, rebuilt from code on every boot. Stored
  settings and meta are a separate concern.
