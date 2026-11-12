---
"plumix": patch
---

Fixes the dev error page's source preview to read only files the Vite dev server would serve itself, following its `server.fs` allow and deny rules, and to answer without a cross-origin `Access-Control-Allow-Origin` header.
