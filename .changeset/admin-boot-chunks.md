---
"plumix": patch
---

Cuts the JavaScript the admin downloads on first load from 299 kB to 236 kB gzipped. The core blocks, with their syntax highlighter and HTML sanitizer, now load only when the visual editor opens. React, TanStack and Radix ship as separate chunks whose file names stay the same across admin-only releases, so browsers keep them cached.
