type MarkRegistrationErrorCode =
  | "invalid_name_pattern"
  | "duplicate_name"
  | "core_mark_collision"
  | "theme_override_unknown_name"
  | "schema_name_mismatch"
  | "invalid_keyboard_shortcut";

interface MarkRegistrationErrorFields {
  markName?: string;
  pattern?: string;
  layer?: string;
  registeredBy?: string;
  themeId?: string;
  schemaName?: string;
  keyboardShortcut?: string;
}

export class MarkRegistrationError extends Error {
  static {
    MarkRegistrationError.prototype.name = "MarkRegistrationError";
  }

  readonly code: MarkRegistrationErrorCode;
  readonly markName: string | undefined;
  readonly pattern: string | undefined;
  readonly layer: string | undefined;
  readonly registeredBy: string | undefined;
  readonly themeId: string | undefined;
  readonly schemaName: string | undefined;
  readonly keyboardShortcut: string | undefined;

  private constructor(
    code: MarkRegistrationErrorCode,
    message: string,
    fields: MarkRegistrationErrorFields,
  ) {
    super(message);
    this.code = code;
    this.markName = fields.markName;
    this.pattern = fields.pattern;
    this.layer = fields.layer;
    this.registeredBy = fields.registeredBy;
    this.themeId = fields.themeId;
    this.schemaName = fields.schemaName;
    this.keyboardShortcut = fields.keyboardShortcut;
  }

  static invalidNamePattern(ctx: {
    name: string;
    pattern: string;
  }): MarkRegistrationError {
    return new MarkRegistrationError(
      "invalid_name_pattern",
      `Mark name "${ctx.name}" does not match the required pattern ` +
        `${ctx.pattern}. Names must be lowercase tokens, optionally namespaced ` +
        `("bold", "code", "affiliate/link").`,
      { markName: ctx.name, pattern: ctx.pattern },
    );
  }

  static duplicateName(ctx: {
    name: string;
    layer: "core" | "plugin" | "theme";
  }): MarkRegistrationError {
    return new MarkRegistrationError(
      "duplicate_name",
      `Mark "${ctx.name}" is registered twice within the ${ctx.layer} ` +
        `layer. Each name must be unique within its layer; cross-layer ` +
        `overrides follow theme > plugin > core precedence.`,
      { markName: ctx.name, layer: ctx.layer },
    );
  }

  static coreMarkCollision(ctx: {
    name: string;
    registeredBy: string;
  }): MarkRegistrationError {
    return new MarkRegistrationError(
      "core_mark_collision",
      `Plugin "${ctx.registeredBy}" tried to register mark "${ctx.name}" ` +
        `which collides with a core-shipped mark. Use a plugin-scoped ` +
        `namespace (\`pluginId/markName\`) for plugin-contributed marks.`,
      { markName: ctx.name, registeredBy: ctx.registeredBy },
    );
  }

  static themeOverrideUnknownName(ctx: {
    name: string;
    themeId: string;
  }): MarkRegistrationError {
    return new MarkRegistrationError(
      "theme_override_unknown_name",
      `Theme "${ctx.themeId}" tried to override mark "${ctx.name}", but no ` +
        `core or plugin mark by that name is registered.`,
      { markName: ctx.name, themeId: ctx.themeId },
    );
  }

  static schemaNameMismatch(ctx: {
    specName: string;
    schemaName: string;
  }): MarkRegistrationError {
    return new MarkRegistrationError(
      "schema_name_mismatch",
      `Mark "${ctx.specName}" has a Tiptap schema with name "${ctx.schemaName}". ` +
        `The spec name and the Tiptap mark name must match — the walker ` +
        `dispatches on mark.type === registry-key.`,
      { markName: ctx.specName, schemaName: ctx.schemaName },
    );
  }

  static invalidKeyboardShortcut(ctx: {
    name: string;
    keyboardShortcut: string;
  }): MarkRegistrationError {
    return new MarkRegistrationError(
      "invalid_keyboard_shortcut",
      `Mark "${ctx.name}" declares keyboardShortcut "${ctx.keyboardShortcut}" ` +
        `which does not parse as a Tiptap modifier expression (e.g. ` +
        `"Mod-b", "Mod-Shift-X").`,
      { markName: ctx.name, keyboardShortcut: ctx.keyboardShortcut },
    );
  }
}
