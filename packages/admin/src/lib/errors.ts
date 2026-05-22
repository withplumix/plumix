type AdminPluginRegistryErrorCode =
  | "duplicate_key"
  | "input_type_reserved"
  | "invalid_block_name"
  | "ssr_walked_admin_spec";

interface AdminPluginRegistryErrorFields {
  registerName?: string;
  key?: string;
  type?: string;
  blockName?: unknown;
}

export class AdminPluginRegistryError extends Error {
  static {
    AdminPluginRegistryError.prototype.name = "AdminPluginRegistryError";
  }

  readonly code: AdminPluginRegistryErrorCode;
  readonly registerName: string | undefined;
  readonly key: string | undefined;
  readonly type: string | undefined;
  readonly blockName: unknown;

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
    this.blockName = fields.blockName;
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

  static invalidBlockName(ctx: { name: unknown }): AdminPluginRegistryError {
    return new AdminPluginRegistryError(
      "invalid_block_name",
      `registerPluginBlock: spec.name must be a namespaced string ` +
        `("plugin/slug") to disambiguate from first-party blocks. ` +
        `Got: ${JSON.stringify(ctx.name)}`,
      { blockName: ctx.name },
    );
  }

  static ssrWalkedAdminSpec(): AdminPluginRegistryError {
    return new AdminPluginRegistryError(
      "ssr_walked_admin_spec",
      "Admin-only plugin block spec rendered on the SSR walker path. " +
        "registries.ts contributions are admin-only; the runtime walker " +
        "must source `component` from `@plumix/blocks` directly.",
      {},
    );
  }
}
