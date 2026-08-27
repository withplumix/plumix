# One platform bounded context, not one per package

Plumix is a monorepo of many packages (`core`, `blocks`, `plumix`, `admin*`,
`runtimes`, …), so the obvious move is a `CONTEXT.md` per package with a
`CONTEXT-MAP.md` at the root. We deliberately did **not** do that. The domain
vocabulary — `entry`, `term`, `block`, `field`, `theme`, `template`,
`principal`, `segment` — has exactly one meaning across every package: a `block`
is the same concept whether it is defined in `blocks`, registered in `core`,
edited in `admin-editor`, or re-exported by the `plumix` façade. That is a
single ubiquitous language, so it belongs in a single root `CONTEXT.md`, split
by subheading for size. The seam that matters is the **language boundary**
(where a word's meaning changes), not the **build boundary** (where a package
starts).

## Considered options

- **One `CONTEXT.md` per package + root map** (rejected). Package boundaries are
  a build concern, not a language concern. This would define `entry`, `block`,
  and `field` in three-to-four glossaries each — drift by construction, the
  exact failure a ubiquitous language exists to prevent.
- **Split the platform into Authoring / Delivery / Access contexts** (rejected).
  These are real subdomains, but no word means different things across them
  (`entry` is authored in one and rendered in another — the _same_ entry). They
  are subheadings within one context, not separate contexts.

## Consequences

- Adding a term means editing one file; there is no "which package's glossary?"
  question.
- The one genuine second context is `create-plumix-app` scaffolding, where
  `template` forks to mean _project template_. When that context is modelled, we
  promote the root `CONTEXT.md` to a `CONTEXT-MAP.md` with two entries —
  `platform` and `scaffolding` — rather than N package entries.
