---
"plumix": patch
---

Fixes block strings, mails, the welcome screen and the admin bar rendering in English on a site that enables a regional locale: a `de-AT` site now shows them in German, and `zh-SG` in Simplified Chinese. The build picks each enabled locale's closest shipped catalog, and a locale no catalog serves stays in English without a warning.
