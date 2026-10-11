---
"plumix": minor
---

Adds `alwaysTo(address, transport)`, which wraps a mailer so every mail goes to one address, for a staging site running on real data. The original recipient is named at the top of the text and HTML body, both arguments accept an `EnvInput`, and an invalid address throws a config error.
