# A plugin extends core through declared events, filters and registrations

Plumix's extension points were string names in two global interfaces, `FilterRegistry` and
`ActionRegistry`, filled by `declare module` and fired by whichever of six executor methods the
caller picked. The name said nothing about how its handlers ran: `applyFilterSync` accepted a
filter whose handlers return a promise and failed only at runtime, `blocks:loader:error` was an
action written as a filter over `undefined`, and `admin_bar:nodes`, `debug:panels` and
`form:validate` were lists built through a pipeline any handler could empty. Handlers took
positional arguments, so audit-log read its context back as `args.at(-1) as AppContext`. A
third-party plugin could declare a hook only through `declare module "plumix"`, which VISION
principle 1 rules out, and `entry:${string}:published` accepted any typo.

> **A plugin extends core in three ways, and each has one API.**
>
> - **An event** announces something that already happened. It is a value declared with
>   `defineEvent<Payload>(id)`; a plugin subscribes with `ctx.events.on(event, handler)` and
>   code fires it with `ctx.events.emit(event, payload)`.
> - **A filter** changes a value core is about to use. It is a value declared with
>   `defineFilter<Value, Input>(id, { sync })`; a plugin subscribes with
>   `ctx.filters.add(filter, handler)` and code runs it with
>   `ctx.filters.apply(filter, value, input)`.
> - **A registration** adds a named item to something core shows or runs. It is a `register*`
>   call in `setup`, with functions for whatever depends on the request.
>
> The word "hook" names none of them.

## What this means

- Core's events and filters are grouped by subject and exported from `plumix/plugin`: `entry`,
  `term`, `user`, `settings`, `render`, `block`, `sync`, `auth`. A plugin exports its own the same
  way, one namespace named after its subject, such as `form` from `@plumix/plugin-forms`.
- A subject registered by name is scoped with `.for(name)`: `entry.for("product").published`.
  `registerEntryType` and `registerTermTaxonomy` return that same scoped object. A scope naming
  nothing registered fails boot and lists the registered names. Scoped handlers run before
  unscoped ones of the same order.
- An event handler is `(payload, ctx)` and a filter handler is `(value, input, ctx)`, where `ctx`
  is the `AppContext` the event or filter fired from. Payload keys are glossary nouns:
  `{ entry, previous }`, `{ entry, previousStatus }`.
- An id is required, written `<owner>:<name>`, and shown in logs and traces. Two events or
  filters with one id fail boot. A handler registered twice runs twice.
- Ordering is `order: "early" | "late"`, then plugin config order, then registration order.
  Numeric priority is gone.
- Event handlers start in order, run concurrently and are awaited. A failure stops neither the
  others nor the caller; it goes to `ctx.logger` and the trace, and `emit` returns it.
- Filter handlers run one after another. A throw propagates unchanged and aborts the operation,
  which is how `entry.beforeSave` vetoes a save. A filter declared `sync` rejects, at the type
  level, a handler that returns a promise. Each async step still works on a `structuredClone` of
  the value until a benchmark of `render.document` shows the cost.
- A registration carries a required `id`, unique at boot, and an optional `order`. A function on
  it that throws hides only its own item and is logged. The admin bar, the debug bar, the dev
  error page, admin search and forms' cross-form validation take registrations, not filters.
- Events and filters fire on a request or a job, never at boot. The theme reaches plugins as
  `ctx.theme` in `setup` and `afterSetup`, and a plugin adds document tags with
  `registerDocumentManifest`, merged at boot.
- `state`, `provides`, `setup` and `afterSetup` are lifecycle steps.

## Considered options

- **Keep string names and encode each one's kind in the registry type** (rejected). Less churn,
  but a third-party plugin still needs `declare module` to declare one, and a plugin that is not
  installed still type-checks.
- **Replace actions with an event emitter** (rejected). Node's `EventEmitter` and `EventTarget`
  dispatch synchronously and ignore returned promises. Emittery waits for its listeners but has no
  ordering, plugin attribution or tracing, which is what core's own runner already adds.
- **Middleware with `next()` for plugins** (rejected for now). Nothing in the repo needs to wrap
  a request, and plugin RPC already has oRPC's middleware. A future need gets a narrow filter.
- **A third kind for lists, collected from every handler** (rejected). A registration gives the
  same isolation and adds what a hook can't: a duplicate id fails boot instead of warning on
  every request.
- **Numeric priority** (rejected). Outside tests, its one use in a hook registration was
  `LAST = 1000`. The site sets relative order by listing plugins.
- **Unsubscribe and `once`** (rejected for now). Handlers live as long as the app, and each
  `buildApp` has its own registry.

## Consequences

- This supersedes [ADR 0009](0009-a-renamed-hook-breaks-at-compile-time.md). Its rule still
  holds, and holds more strongly: a renamed event or filter breaks as a missing export, in every
  environment, and core keeps no aliases.
- An optional integration with a plugin that may not be installed checks `ctx.plugins` in
  `afterSetup` before subscribing.
- A handler that writes core's own entities goes through core's write API, not the raw table;
  #3249 owns that rule and its lint.
- The change lands in slices, each moving one group of extension points and every first-party
  subscriber in the same PR, so no extension point is ever reachable both ways. The slice that
  removes `addFilter`, `addAction`, `HookRegistry` and the `hook:` trace spans is a breaking minor
  release.
- Out of scope: whether registrations move onto the descriptor, the `rpc:*:input` and
  `rpc:*:output` filters (revisited after #3249), and narrowing a scoped payload to its type's
  own fields.
