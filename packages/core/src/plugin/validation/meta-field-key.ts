/**
 * Shared by registration and the RPC write path, so no registered key is
 * rejected on write. Separate file to avoid an import cycle with sub-fields.
 */
export const META_FIELD_KEY_RE = /^[a-zA-Z0-9_:-]+$/;

export const META_FIELD_KEY_MAX_LENGTH = 200;

export function isValidMetaFieldKey(key: string): boolean {
  return key.length <= META_FIELD_KEY_MAX_LENGTH && META_FIELD_KEY_RE.test(key);
}
