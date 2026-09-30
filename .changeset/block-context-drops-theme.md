---
"plumix": minor
---

Removes `BlockContext.theme`, which was always `null`. A theme has no identity to expose; read breakpoints from the block's render props.
