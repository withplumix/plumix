---
"plumix": patch
---

Fixes an e2e suite failing before any test with "is already used" after an earlier run was stopped: the web server `definePlumixE2EConfig` starts now stops when its Playwright run does, however that run ended, instead of holding the port for minutes.
