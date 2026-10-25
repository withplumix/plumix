---
"plumix": patch
---

Fixes plugin strings showing in English on a site that enables a regional locale. A plugin's admin screens, block renders and mails now use the closest catalog the plugin ships, by the same rule as core's, so a plugin that ships `de` serves a `de-AT` site.
