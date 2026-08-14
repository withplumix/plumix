/**
 * Reserved entry-meta key holding an editor's per-entry access-policy choice —
 * the value is the `key` of a {@link SelectableAccessPolicy} declared in the
 * entry type's `access.policies` space. The editor writes it (as the dedicated
 * `access` update field, not through the plugin meta sanitizer); the gate reads
 * it to pick the effective policy. Part of the reserved `__plumix_*` namespace,
 * so it rides the same strip / keep rules as `__plumix_template`.
 *
 * In its own zero-dependency module so both the browser-facing manifest barrel
 * and the server gate can import the constant without pulling in the access
 * resolver primitives.
 */
export const ACCESS_POLICY_META_KEY = "__plumix_access";
