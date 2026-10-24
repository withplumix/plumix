---
"plumix": minor
"@plumix/plugin-comments": patch
"@plumix/plugin-forms": patch
"@plumix/plugin-audit-log": patch
"@plumix/plugin-search": patch
"@plumix/plugin-media": patch
---

Capabilities now name the default roles that receive them. `registerCapability(name, { grantTo: ["editor"] })` grants a plugin capability to exactly those roles plus `admin`, and one registered without `grantTo` goes to `admin` alone. An entry type's or taxonomy's `capabilities` override maps an action to a list of roles, such as `{ delete: ["author", "editor"] }`. Two types that pool one `capabilityType` with different grants now boot and combine them, where they used to throw. The registered capability carries `grantTo` in place of `minRole` and `defaultGrants`. The `minRole` forms keep working for now, and the first-party plugins use the new form, with every role's rights unchanged.
