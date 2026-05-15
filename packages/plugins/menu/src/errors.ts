type MenuPluginErrorCode =
  | "invalid_location_id"
  | "location_label_empty"
  | "duplicate_location"
  | "resolve_parent_ids_length_mismatch"
  | "menu_create_no_row_returned";

interface MenuPluginErrorFields {
  id?: string;
  pattern?: string;
  maxLength?: number;
  itemsLength?: number;
  resolvedIdsLength?: number;
}

export class MenuPluginError extends Error {
  static {
    MenuPluginError.prototype.name = "MenuPluginError";
  }

  readonly code: MenuPluginErrorCode;
  readonly id: string | undefined;
  readonly pattern: string | undefined;
  readonly maxLength: number | undefined;
  readonly itemsLength: number | undefined;
  readonly resolvedIdsLength: number | undefined;

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
    this.itemsLength = fields.itemsLength;
    this.resolvedIdsLength = fields.resolvedIdsLength;
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

  static duplicateLocation(ctx: { id: string }): MenuPluginError {
    return new MenuPluginError(
      "duplicate_location",
      `registerMenuLocation: location "${ctx.id}" is already registered. ` +
        `Each location id must be unique across themes.`,
      ctx,
    );
  }

  static resolveParentIdsLengthMismatch(ctx: {
    itemsLength: number;
    resolvedIdsLength: number;
  }): MenuPluginError {
    return new MenuPluginError(
      "resolve_parent_ids_length_mismatch",
      `resolveParentIds: items.length (${String(ctx.itemsLength)}) does not match resolvedIds.length (${String(ctx.resolvedIdsLength)})`,
      ctx,
    );
  }

  static menuCreateNoRowReturned(): MenuPluginError {
    return new MenuPluginError(
      "menu_create_no_row_returned",
      "menu.create: insert returned no row",
      {},
    );
  }
}
