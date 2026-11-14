type MenuPluginErrorCode =
  "invalid_location_id" | "location_label_empty" | "invalid_location_max_depth";

interface MenuPluginErrorFields {
  id?: string;
  pattern?: string;
  maxLength?: number;
}

export class MenuPluginError extends Error {
  static {
    MenuPluginError.prototype.name = "MenuPluginError";
  }

  readonly code: MenuPluginErrorCode;
  readonly id: string | undefined;
  readonly pattern: string | undefined;
  readonly maxLength: number | undefined;

  private constructor(
    code: MenuPluginErrorCode,
    message: string,
    fields: MenuPluginErrorFields,
  ) {
    super(message);
    this.code = code;
    this.id = fields.id;
    this.pattern = fields.pattern;
    this.maxLength = fields.maxLength;
  }

  static invalidLocationId(ctx: {
    id: string;
    pattern: string;
    maxLength: number;
  }): MenuPluginError {
    return new MenuPluginError(
      "invalid_location_id",
      `registerMenuLocation: id "${ctx.id}" is invalid. Location ids must ` +
        `match /${ctx.pattern}/ and be 1–${String(ctx.maxLength)} chars.`,
      ctx,
    );
  }

  static locationLabelEmpty(ctx: { id: string }): MenuPluginError {
    return new MenuPluginError(
      "location_label_empty",
      `registerMenuLocation("${ctx.id}"): \`label\` is required and must be a non-empty, non-whitespace string.`,
      ctx,
    );
  }

  static invalidLocationMaxDepth(ctx: {
    id: string;
    hardCap: number;
  }): MenuPluginError {
    return new MenuPluginError(
      "invalid_location_max_depth",
      `registerMenuLocation("${ctx.id}"): \`maxDepth\` must be an integer from 1 to ${String(ctx.hardCap)}.`,
      { id: ctx.id },
    );
  }
}
