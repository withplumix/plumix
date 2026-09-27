---
"@plumix/plugin-menu": minor
---

Removes `getEligibleMenuKinds` from `@plumix/plugin-menu/server`. Only the plugin's own menu editor used it, and there is no replacement. The menu readers (`getMenuByName`, `getMenuForLocation` and their plural forms) are unchanged.
