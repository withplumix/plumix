---
"@plumix/plugin-og": patch
---

Follows core's page-kind renames and needs `plumix` 0.24.0. `CardTarget` and `CardIdentity` use the new kinds (`frontPage`, `entryType`), and `card.archive()` and `card.taxonomy()` keep their names while binding the renamed `entryType` and `term` tiers. Card URLs and storage keys don't change: the front page's card is still at `front-page` and an entry type's at `archive/<type>`, so stored cards and shared `og:image` links keep working.
