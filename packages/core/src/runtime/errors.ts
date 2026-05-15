type AppBootErrorCode =
  | "duplicate_theme_id"
  | "schema_export_conflict"
  | "plugin_id_collides_with_core_rpc_namespace"
  | "plugin_id_collides_with_core_rpc_router";

export class AppBootError extends Error {
  static {
    AppBootError.prototype.name = "AppBootError";
  }

  readonly code: AppBootErrorCode;
  readonly themeId: string | undefined;
  readonly pluginId: string | undefined;
  readonly schemaKey: string | undefined;
  readonly previousOwner: string | undefined;

  private constructor(
    code: AppBootErrorCode,
    message: string,
    fields: {
      themeId?: string;
      pluginId?: string;
      schemaKey?: string;
      previousOwner?: string;
    },
  ) {
    super(message);
    this.code = code;
    this.themeId = fields.themeId;
    this.pluginId = fields.pluginId;
    this.schemaKey = fields.schemaKey;
    this.previousOwner = fields.previousOwner;
  }

  static duplicateThemeId(ctx: { themeId: string }): AppBootError {
    return new AppBootError(
      "duplicate_theme_id",
      `Theme id "${ctx.themeId}" appears more than once in config.themes`,
      ctx,
    );
  }

  static schemaExportConflict(ctx: {
    pluginId: string;
    schemaKey: string;
    previousOwner: string;
  }): AppBootError {
    return new AppBootError(
      "schema_export_conflict",
      `Plugin "${ctx.pluginId}" redefines schema export "${ctx.schemaKey}" (already defined by "${ctx.previousOwner}")`,
      ctx,
    );
  }

  static pluginIdCollidesWithCoreRpcNamespace(ctx: {
    pluginId: string;
  }): AppBootError {
    return new AppBootError(
      "plugin_id_collides_with_core_rpc_namespace",
      `Plugin id "${ctx.pluginId}" collides with a core RPC namespace ` +
        `at buildApp; rename the plugin.`,
      ctx,
    );
  }

  static pluginIdCollidesWithCoreRpcRouter(ctx: {
    pluginId: string;
  }): AppBootError {
    return new AppBootError(
      "plugin_id_collides_with_core_rpc_router",
      `Plugin id "${ctx.pluginId}" collides with the core RPC router key ` +
        `at buildApp; rename the plugin.`,
      ctx,
    );
  }
}
