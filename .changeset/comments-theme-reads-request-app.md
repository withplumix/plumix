---
"@plumix/plugin-comments": patch
---

Fixes `PlumixCommentForm` taking `requireEmail` from whichever app booted last in the process. It now reads the configuration of the app serving the request, and renders nothing on a site that does not install the plugin.
