# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repo root — it points at one `CONTEXT.md` per package. Read each one relevant to the topic.
- **`docs/adr/`** — repo-wide architectural decisions.
- **`packages/<pkg>/CONTEXT.md`** and **`packages/<pkg>/docs/adr/`** — package-scoped glossary and decisions.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure (Plumix monorepo)

```
/
├── CONTEXT-MAP.md
├── docs/adr/                              ← repo-wide decisions
└── packages/
    ├── core/
    │   ├── CONTEXT.md
    │   └── docs/adr/                      ← package-scoped decisions
    ├── admin/
    │   ├── CONTEXT.md
    │   └── docs/adr/
    ├── plugins/
    │   ├── blog/
    │   │   ├── CONTEXT.md
    │   │   └── docs/adr/
    │   └── pages/
    │       ├── CONTEXT.md
    │       └── docs/adr/
    └── runtimes/
        └── cloudflare/
            ├── CONTEXT.md
            └── docs/adr/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in the relevant `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
