type AdminPluginRegistryErrorCode = "duplicate_key" | "input_type_reserved";

interface AdminPluginRegistryErrorFields {
  registerName?: string;
  key?: string;
  type?: string;
}

export class AdminPluginRegistryError extends Error {
  static {
    AdminPluginRegistryError.prototype.name = "AdminPluginRegistryError";
  }

  readonly code: AdminPluginRegistryErrorCode;
  readonly registerName: string | undefined;
  readonly key: string | undefined;
  readonly type: string | undefined;

  private constructor(
    code: AdminPluginRegistryErrorCode,
    message: string,
    fields: AdminPluginRegistryErrorFields,
  ) {
    super(message);
    this.code = code;
    this.registerName = fields.registerName;
    this.key = fields.key;
    this.type = fields.type;
  }

  static duplicateKey(ctx: {
    registerName: string;
    key: string;
  }): AdminPluginRegistryError {
    return new AdminPluginRegistryError(
      "duplicate_key",
      `${ctx.registerName}: "${ctx.key}" is already registered. ` +
        `Two plugins are claiming the same key; rename one.`,
      ctx,
    );
  }

  static inputTypeReserved(ctx: { type: string }): AdminPluginRegistryError {
    return new AdminPluginRegistryError(
      "input_type_reserved",
      `registerPluginFieldType: "${ctx.type}" is reserved for built-in renderers. ` +
        `Pick a different inputType for your custom field — see the host's ` +
        `RESERVED_INPUT_TYPES list.`,
      ctx,
    );
  }
}
