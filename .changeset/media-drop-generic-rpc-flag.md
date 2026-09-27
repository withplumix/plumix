---
"@plumix/plugin-media": minor
---

Removes `mediaBlocks` from the package root. The plugin registers its blocks itself, and nothing outside it read the list. Also stops passing `excludeFromGenericRpc` when registering the `attachment` entry type, because `plumix` no longer accepts that option. Behaviour is unchanged.
