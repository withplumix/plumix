# A block declares its deps like a template

A template declares the template deps it reads (`{ settings: ["site"], menus:
[...] }`), and the page loads them once per request. A block could read only
the `site` settings group, through `BlockContext.siteSettings`. A block whose
copy an admin edits had two ways to get any other group (#2908). It could run
a loader in every instance on every render, for static copy. Or its template
could inject the group into the block's attrs before render. eduscope.uk's
school template declares 16 settings groups and writes `attrs.copy` into each
matching block. The block then renders right only under that template, never
in the editor canvas, and every template using it repeats the wiring.

> **A block declares the template deps it reads under `deps`, with the
> template's kinds and keys, either statically or as a pure function of its
> stored attributes. Before a page renders, core collects every block's
> declaration from the trees it will render, unions them with the template's
> and theme's, and loads each kind once through `loadTemplateDeps`. `render`
> receives the block's own keys as `deps`. The editor canvas gets the same
> values, and asks the server again when an edit declares a key it lacks.
> `BlockContext.siteSettings` is removed in favour of
> `deps: { settings: ["site"] }`.**

## What this means

- **One declaration shape.** The kinds are the `TemplateDepRegistry` kinds,
  core's and every plugin's, and the keys are typed the same way. A block
  declares arrays only: it has no inherited declaration for a template's
  `(prev) => next` form to compose. An unknown kind or a key of the wrong type
  fails to compile, and `render`'s `deps` is typed per declared kind and key.
  The registry moves down into `blocks/` (ADR 0010). Core's index exports it
  from there, and every reference in core imports it from there too. A
  `declare module "plumix"` augmentation merges only into the registry reached
  along the path the façade exports, so a re-export in between would leave
  some references without it.
- **From attributes.** `deps: (attrs) => ({ menus: [attrs.location] })` is
  evaluated against each node's stored attributes before anything renders, so
  it must be pure. Per-instance data that needs a query stays a block loader's
  job.
- **Page-wide union.** The trees are the entry's content on an entry page and
  each listed entry's on an archive, whatever `prefetchArchiveLoaders` says.
  Twenty instances of a block cost one load of each kind. A key the loader
  found nothing for reads `null`, as in a template. A dep that throws a page
  outcome ends the request (ADR 0032). Any other failure degrades to `null`.
- **Cache tags for free.** The loaders already declare their page tags, so the
  stored page carries the tag of every block dep. Saving a settings group a
  block reads purges every page that renders it, through the existing `s:`
  purge.
- **Canvas parity.** The edit-mode render embeds the blocks' deps in the
  canvas's render env. The page's template deps aren't embedded, so the canvas
  never sees data no block asked for. When an edit declares a key the canvas
  holds nothing for, the canvas sends its tree to the host. The host calls
  `entry.resolveBlockDeps`, which evaluates the declarations on the server,
  loads through the same loaders and pushes the result back. A client can't
  name keys no block declares.
- **One way to read a value (#2493).** `BlockContext.siteSettings` is gone, with
  no shim. `core/rich-text` declares `deps: { settings: ["site"] }` and hands
  the group to its shortcodes, whose context keeps `siteSettings`.

## Considered options

- **A settings-only `settings` key on `defineBlock`** (rejected). It is what
  #2908 first asked for, but menus, comments and every plugin dep kind would
  each need a key of their own. The template's declaration already covers
  them all.
- **Per-block loaders for static data** (rejected). Async work in every
  instance on every render, plus loader semantics a presentational block has no
  use for: an error fallback, and serialized loader data in the editor.
- **Template attrs injection** (rejected). It ties a block to the one template
  that wires it, it never reaches the editor canvas, and every template that
  uses the block repeats it.
