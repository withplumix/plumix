---
"@plumix/plugin-menu": patch
---

Fixes menu items silently disappearing from the rendered menu when they link to an entry type or taxonomy that leaves `isPublic` unset. The public render now uses the same eligibility rule as the menu editor, so items of a public type marked `isShownInMenus: false` are also left out of the render, matching the editor, which already shows them as broken.
