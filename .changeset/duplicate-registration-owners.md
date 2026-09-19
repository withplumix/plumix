---
"plumix": patch
---

Names both sides in duplicate-registration errors: the plugin (or core) that already holds the key and the plugin that tried to register it again. Duplicate plugin routes now raise the same `DuplicateRegistrationError`, a taxonomy's kind reads `term taxonomy`, and login-link and scheduled-task identifiers drop the `<pluginId>:` prefix now that the message names the plugin.
