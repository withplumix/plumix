---
"@plumix/blocks": minor
---

Resolve the client island error overlay's stack to original source frames.

The dev island error overlay now shows the same frame view as the server error
page instead of a raw browser stack: each frame's original `file:line` (with the
project base path stripped), application frames expanded and framework frames
collapsed behind a toggle, and clicking a frame reveals its source excerpt with
the offending line highlighted.

Browser stacks carry transformed positions pointing at Vite's served module
URLs, so a new dev-only Node resolver POSTs the raw stack, maps each frame back
through the dev server's per-module sourcemaps, and returns the resolved frames.
The overlay's indicator is now a compact count badge, the modal gives the code
excerpt the room (a ~30/70 split), long frame names truncate, and the React
component stack is shown only as a fallback when no frames resolve. Everything
stays dev-only and gated on `process.env.PLUMIX_DEV`.
