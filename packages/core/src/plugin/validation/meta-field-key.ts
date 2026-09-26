// The one meta field key rule. Registration and the RPC write path both
// build from it — a key registration accepts but a write rejects is a dead
// field the admin only discovers later. Lives apart from meta-box-fields.ts
// because the sub-field validator imports it and meta-box-fields.ts already
// imports the sub-field module.
export const META_FIELD_KEY_RE = /^[a-zA-Z0-9_:-]+$/;

export const META_FIELD_KEY_MAX_LENGTH = 200;

export function isValidMetaFieldKey(key: string): boolean {
  return key.length <= META_FIELD_KEY_MAX_LENGTH && META_FIELD_KEY_RE.test(key);
}
