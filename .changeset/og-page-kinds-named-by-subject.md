---
"@plumix/plugin-og": minor
---

Follows core's page-kind renames. `CardTarget` and `CardIdentity` use the new kinds (`frontPage`, `entryType`), and the generic card builders `card.archive()` and `card.taxonomy()` become `card.entryType()` and `card.term()`. Card URLs and storage keys don't change: the front page's card is still at `front-page` and an entry type's at `archive/<type>`, so stored cards and shared `og:image` links keep working.
