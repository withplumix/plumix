---
"plumix": minor
---

Changes `ctx.registerTemplateDep` so a template dep says what its keys identify. A `TemplateDepRegistry` entry declares either `{ slug: string; result }` or `{ location: string; result }`, registration passes the matching `keyedBy: "slug" | "location"`, and the loader receives the declared keys under that name — `load: ({ slugs }, ctx)` or `load: ({ locations }, ctx)` — instead of a bare array. A loader that reads the wrong name no longer compiles. Plugins that register template deps need both changes.
