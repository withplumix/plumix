# A renamed hook breaks at compile time, not at runtime

#2445 renamed the filter plugins contribute debug panels through, from
`debug_bar:panels` to `debug:panels`, with no alias. A plugin still registering
on the old name registers on a name nothing fires: its panel disappears and
nothing reports it (#2449).

The set of hook names already exists in one place: the type system.
`FilterRegistry` and `ActionRegistry` are empty interfaces that core and each
plugin fill in by module augmentation, next to the code that fires the hook, and
`FilterName` is `keyof FilterRegistry`. A plugin compiled against the current
`plumix` cannot register on a name that is gone:

```ts
ctx.addFilter("debug_bar:panels", addPanel);
// Argument of type '"debug_bar:panels"' is not assignable to parameter of
// type 'FilterName'.
```

> **A hook name is a TypeScript contract. Renaming or removing a hook is a
> breaking change, announced in its changeset and caught by the type checker.
> Core does not check hook names at runtime and does not keep deprecated names
> working.**

## Considered options

- **Warn in dev on any undeclared name** (rejected). General, but core has no
  runtime list of declared names to check against. Every hook declaration in core
  and in every plugin would have to register its name twice, once as a type and
  once as a value, and keep the two in step. A plugin that registers on another
  plugin's hook as an optional integration would be flagged whenever that plugin
  isn't installed.
- **A table of retired names that throws at setup** (rejected). It catches the
  stale plugin loudly and aliases nothing. It is still deprecation machinery, and
  it grows with every rename: WordPress's `apply_filters_deprecated`, arrived at
  one row at a time.
- **Keep the old name working as an alias** (rejected). It hides the break
  instead of reporting it, and ADR 0003 retired `debug_bar:panels` on purpose.
- **Report filters that have handlers but never ran during a request**
  (rejected). No runtime list is needed, but a filter that legitimately fires
  only on some requests reads as a false alarm on every other request.
- **Hooks as exported values**, `ctx.addFilter(debugPanels, fn)` (rejected). A
  renamed hook would then fail as a missing import, in every environment. That
  means replacing string hook names across core and every plugin, which is out of
  proportion to one rename in the project's history.

## Consequences

- A plugin built against an older core, or one whose author suppressed the type
  error, loses its handler with no signal. This is accepted. The fix is to
  rebuild the plugin against the core it runs on.
- The reverse holds too: a plugin built for a new name runs on an older core
  that never fires that name. No check added to core could catch this, because
  the old core has never heard of the new name.
- A plugin's peer range on `plumix` covers every later `0.x` minor
  (`>=0.24.0 <1.0.0`), so an upgrade can cross a hook rename without an install
  warning. Before 1.0, any minor may break, and the changeset is where
  a rename is announced.
- A rename carries no compatibility code. When a hook is renamed, the old name
  goes away in the same change.
