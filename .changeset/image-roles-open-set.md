---
"plumix": minor
"@plumix/plugin-media": minor
---

Adds `ctx.registerImageRole(name, { single })`, so a plugin or theme declares its own image roles (`hero`, `thumbnail`, `avatar`) next to core's `featured` and `ogImage`. Type a new name by augmenting `ImageRoles` through `declare module "plumix"`. Registering a name twice fails and names both owners.

Adds `imageRoleFields(registry, scope, role)` to `plumix/plugin`. It returns the fields in one role for an entry type, a term taxonomy or the users, in declaration order, each with the key path to its value, including a field nested in groups. Core resolves the index once at boot.

Adds `.role(name)` to the media field builder. `.featured()` and `.ogImage()` are now shorthand for it. A role field with no `.accept()` now stores `accept: "image/"`, which also applies to existing `.featured()` / `.ogImage()` fields. An accept that admits anything other than images throws a `FieldConfigError`, which `plumix/fields` now exports.

Boot now fails, naming the field and its scope, for a role nobody registered, a role field inside a repeater at any depth, a multi-value role field, and a second field in a single role on one entry type, term taxonomy or users. Term and user meta boxes and fields nested in groups used to go unchecked. `buildApp` runs these checks as well as the manifest build. The error code `entry_has_multiple_featured_fields` is now `single_image_role_has_multiple_fields` (breaking).
