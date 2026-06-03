# Plugin-author guide

A plugin is a function. It receives a context object and contributes to
the merged registry: entry types, term taxonomies, blocks, marks, field
types, metaboxes, settings groups, lookup adapters, scheduled tasks, RPC
routers, capabilities, login links, admin pages, rewrite rules.

## Minimum-viable plugin

```ts
import { definePlugin } from "plumix/plugin";

export function newsletterSignup() {
  return definePlugin("newsletter", (ctx) => {
    ctx.registerEntryMetaBox({
      id: "newsletter-fields",
      label: "Newsletter",
      entryTypes: ["post"],
      fields: [
        { key: "newsletter_subject", label: "Subject line", type: "string", inputType: "text" },
        { key: "newsletter_send_after", label: "Send after", type: "string", inputType: "datetime" },
      ],
    });
  });
}
```

Pass it into the Plumix config under `plugins: [newsletterSignup()]`.

## Setup context surface

The `ctx` passed to the plugin's setup function exposes these registration
methods. Each is idempotent within one merge; cross-plugin collisions
(same id, same name) reject at startup.

### Content + taxonomy

- `ctx.registerEntryType(name, options)` — declares a custom entry type
  with `labels`, `supports`, `versioning`, `termTaxonomies`.
- `ctx.registerTermTaxonomy(name, options)` — declares a taxonomy
  attached to one or more entry types.

### UI extension

- `ctx.registerEntryMetaBox(options)` — Card / Accordion section in the
  editor sidebar (and editor route). Per-entry-type filterable; per-field
  capability-gateable.
- `ctx.registerTermMetaBox(options)` / `ctx.registerUserMetaBox(options)`
  — same for term-edit and user-profile routes.
- `ctx.registerSettingsGroup(...)` / `ctx.registerSettingsPage(...)` —
  contributes settings groups composed into pages on the Settings route.
- `ctx.registerAdminPage(...)` — full-page admin route under
  `/<plugin>/<path>`.

### Block + mark + field-type

- `ctx.registerBlock(blockSpec)` — register a `BlockSpec` produced by
  `defineBlock`. Specs in the `core/` namespace are rejected (reserved
  for `@plumix/blocks`).
- `ctx.registerMark(markSpec)` — register a custom inline mark.
- `ctx.registerFieldType(options)` — register a custom field type
  available in block inputs and metabox fields. The same renderer covers
  both surfaces.

### RPC + lookup

- `ctx.registerRpcRouter(name, router)` — contribute an oRPC router under
  `/_plumix/rpc/<name>/*`.
- `ctx.registerLookupAdapter(options)` — register a reference target
  kind. `entry` / `term` / `user` ship with core; plugins add `media`
  (`@plumix/plugin-media`) etc.

### Lifecycle + auth

- `ctx.hooks.addAction(name, handler)` / `ctx.hooks.addFilter(name, fn)`
  — subscribe to lifecycle events (entry:published, entry:updated, etc.)
  or filter pipeline values.
- `ctx.registerCapability(name, options)` — declare a capability the
  plugin checks at RPC handlers.
- `ctx.registerLoginLink(options)` — surface a login button on the
  standard login screen pointing at the plugin's sign-in flow.

### Scheduling + rewrite

- `ctx.registerScheduledTask(options)` — cron-style background work.
- `ctx.registerRewriteRule(options)` — request-path rewrite.

## Custom blocks

Use the full `defineBlock` surface from `plumix/blocks`. The plugin's
contribution merges into the per-app block registry at `buildApp` time
with precedence `theme > plugin > core` — a theme can override a plugin
block by re-declaring inside `defineTheme.setup`.

```ts
import { defineBlock } from "plumix/blocks";
import { definePlugin } from "plumix/plugin";

const heroBlock = defineBlock({
  name: "acme/hero",
  title: "Hero",
  category: "marketing",
  inputs: [
    { name: "headline", type: "richtext", label: "Headline" },
    { name: "ctaText", type: "text", label: "CTA text" },
    { name: "ctaHref", type: "url", label: "CTA URL" },
  ],
  defaults: { /* … */ },
  render: ({ attrs }) => { /* … */ },
});

export function acme() {
  return definePlugin("acme", (ctx) => {
    ctx.registerBlock(heroBlock);
  });
}
```

## Custom field types

Wrapping a third-party UI as a field type — point picker, address autocomplete,
audio uploader, anything Plumix doesn't ship. The same renderer must work in
both block inputs (Puck) and entry metaboxes (the admin's MetaBoxField).

```ts
ctx.registerFieldType({
  name: "address",
  render: AddressPickerField,
});
```

See [field-type catalog](./field-types.md) for the full inventory and the
admin-bundle wiring details.

## Reference fields

The `entry`, `term`, `user` reference field types are pre-registered.
Adding a new reference kind (e.g. `media` in the media plugin) requires
two pieces:

1. `ctx.registerLookupAdapter({ kind: "media", … })` — the server-side
   resolver that turns a reference id into a `LookupResult`.
2. `ctx.registerFieldType({ name: "media", … })` — the admin-side picker
   UI.

The reference-field RPC dispatches by `kind` to the adapter's lookup
function; the admin-side picker shows the right UI for the kind.

## Lifecycle hooks

Plugin authors subscribe via `ctx.hooks`. Two flavours:

- **Actions** (`hooks.addAction`) — side-effect subscribers. Return value
  ignored. Used for audit logging, cache invalidation, sending email.
- **Filters** (`hooks.addFilter`) — pipeline transformers. Receive the
  value, return a (possibly modified) value. Used for content rewrites,
  attribute defaulting.

Every action / filter has a generic form (`entry:updated`) and a
type-scoped form (`entry:post:updated`). Subscribe to whichever
granularity you need.

Documented hook names live in the `HookRegistry` type; the in-repo
`audit-log` plugin is a working example.

## Testing plugins

`@plumix/core/test` ships `createRpcHarness` for integration tests:

```ts
import { createRpcHarness } from "@plumix/core/test/rpc";

test("newsletter metabox is registered for post entries", async () => {
  const h = await createRpcHarness({ authAs: "editor", plugins: [newsletterSignup()] });
  const manifest = await h.client.manifest.get();
  expect(manifest.entryMetaBoxes.some(b => b.id === "newsletter-fields")).toBe(true);
});
```

For block-only tests use `plumix/blocks/test` (see
[block-authoring guide's testing section](./block-authoring.md#testing)).

## Translations

Plugin labels and admin-chunk copy translate through Lingui. Three
authoring shapes share the same `.po` pipeline:

- **Plain `{id, message}` literals** for server-side and ambient code.
  The plugin package builds with plain `tsc`, no Lingui macro pass, so
  manifest labels and bridge-emitted messages use this shape:
  ```ts
  const POST_LABELS = {
    singular: { id: "plugin.blog.post.singular", message: "Post" },
    // ...
  };
  ```
- **`defineMessage()` descriptors** (`M`-map) for admin-chunk text
  outside JSX — aria-labels, `placeholder`, alert fallbacks routed
  through `i18n._()`. Extractor sees these via the macro.
- **`<Trans>` JSX** for admin-chunk render-time text. Plugin chunks
  share admin's i18n instance via the runtime shim (`@lingui/core` and
  `@lingui/react` are aliased to `plumix/admin/lingui-*`).

### Placeholders need a translator comment

Any descriptor or `<Trans>` whose `message` carries an ICU placeholder
must declare a `comment` describing each placeholder. Lingui extracts
`comment` as a `#.` line in the `.po`, so translators see the
placeholder contract without reading source.

```ts
// Descriptor form
M.deleteAria = defineMessage({
  id: "row.deleteAria",
  message: "Delete {domain}",
  comment: "domain: the hostname being removed from the allowlist",
});

// JSX form
<Trans
  id="dashboard.welcome"
  message="Welcome, {greeting}"
  values={{ greeting }}
  comment="greeting: the user's display name or email"
/>;
```

Without comments, translators guess at placeholder semantics — a
template like `{label} {kind} failed` is meaningless until you know
`label` is plugin-author-supplied and `kind` is a protocol identifier.

### Hand-authored catalogs

First-party plugins hand-author `locales/en.po` because manifest labels
and `M`-map descriptor literals aren't extractor-visible without the
Babel macro pipeline. `lingui compile` (wired via `plumix i18n init`)
regenerates `locales/en.mjs` on every build, so the runtime catalog
stays in sync with the `.po`.

`plumix i18n init` scaffolds `lingui.config.ts`, the compile-error gate
script, and the `i18n:*` package.json entries. Run it once per plugin:

```sh
pnpm --filter @plumix/plugin-newsletter exec plumix i18n init
```

`i18n:check` is deliberately omitted from the scaffolded scripts —
`lingui extract --clean` would orphan every entry the extractor can't
see. The full extract/check loop becomes available once a plugin
migrates to macro-aware authoring.

## See also

- [Block authoring](./block-authoring.md) — the full `defineBlock` surface.
- [Theme authoring](./theme-authoring.md) — overriding plugin blocks.
- [Field-type catalog](./field-types.md) — the 26+ field types.
