import { MAX_PLUGIN_ID_LENGTH, PLUGIN_ID_RE } from "../define.js";
import { PluginContextError } from "../errors.js";

const IDENTIFIER_NAME_RE = /^[a-z][a-z0-9_-]*$/;

export function assertValidFieldTypeName(pluginId: string, type: string): void {
  if (!IDENTIFIER_NAME_RE.test(type) || type.length > 64) {
    throw PluginContextError.invalidFieldTypeName({
      pluginId,
      type,
      pattern: IDENTIFIER_NAME_RE.source,
      maxLength: 64,
    });
  }
}

export function assertValidLookupAdapterKind(
  pluginId: string,
  kind: string,
): void {
  if (!IDENTIFIER_NAME_RE.test(kind) || kind.length > 64) {
    throw PluginContextError.invalidLookupAdapterKind({
      pluginId,
      kind,
      pattern: IDENTIFIER_NAME_RE.source,
      maxLength: 64,
    });
  }
}

// Keep page / group / field names portable: ASCII identifier that
// starts with a letter, then letters/digits/underscores. Hyphens /
// dots are excluded so testids, URL params, and storage keys stay
// portable across SQLite / future MySQL without quoting. Length cap
// mirrors the valibot `settingsIdentifierSchema` on the RPC side so a
// plugin can't register a name its own `settings.get` / `.upsert`
// calls would then reject.
export const SETTINGS_NAME_RE = /^[a-z][a-z0-9_]*$/;
const MAX_SETTINGS_IDENTIFIER_LENGTH = 64;

export function assertValidIdentifier(kind: string, name: string): void {
  if (name.length > MAX_SETTINGS_IDENTIFIER_LENGTH) {
    throw PluginContextError.identifierTooLong({
      kind,
      name,
      maxLength: MAX_SETTINGS_IDENTIFIER_LENGTH,
    });
  }
  if (!SETTINGS_NAME_RE.test(name)) {
    throw PluginContextError.identifierShapeInvalid({
      kind,
      name,
      pattern: SETTINGS_NAME_RE.source,
    });
  }
}

export function assertValidNavGroupId(pluginId: string, id: string): void {
  if (id.length === 0 || id.length > MAX_PLUGIN_ID_LENGTH) {
    throw PluginContextError.invalidNavGroupIdLength({
      pluginId,
      id,
      maxLength: MAX_PLUGIN_ID_LENGTH,
    });
  }
  if (!PLUGIN_ID_RE.test(id)) {
    throw PluginContextError.invalidNavGroupIdShape({
      pluginId,
      id,
      pattern: PLUGIN_ID_RE.source,
    });
  }
}
