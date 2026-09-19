# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the one glossary, split by subheading. Read the sections relevant to the topic.
- **`docs/adr/`** — architectural decisions. There is no package-scoped ADR directory.

Plumix is deliberately **one** bounded context, not one per package: `entry`, `block`, `field` and `template` mean the same thing in `core`, `blocks`, `admin` and the `plumix` façade, so a glossary per package would define each of them several times and drift. ADR 0001 (`docs/adr/0001-one-platform-context.md`) records the decision and the options it rejected. Don't create a `CONTEXT-MAP.md` or a `packages/<pkg>/CONTEXT.md`.

The one anticipated exception is `create-plumix-app` scaffolding, where `template` means _project template_. If that context is ever modelled, the root `CONTEXT.md` is promoted to a `CONTEXT-MAP.md` with two entries — `platform` and `scaffolding` — per ADR 0001.

## File structure

```
/
├── CONTEXT.md                             ← the glossary
└── docs/adr/                              ← every decision
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
