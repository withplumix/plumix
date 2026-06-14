type AppBootErrorCode =
  | "schema_export_conflict"
  | "plugin_id_collides_with_core_rpc_namespace"
  | "rest_resource_path_conflict"
  | "rest_resource_shadows_core";

export class AppBootError extends Error {
  static {
    AppBootError.prototype.name = "AppBootError";
  }

  readonly code: AppBootErrorCode;
  readonly pluginId: string | undefined;
  readonly schemaKey: string | undefined;
  readonly previousOwner: string | undefined;

  private constructor(
    code: AppBootErrorCode,
    message: string,
    fields: {
      pluginId?: string;
      schemaKey?: string;
      previousOwner?: string;
    },
  ) {
    super(message);
    this.code = code;
    this.pluginId = fields.pluginId;
    this.schemaKey = fields.schemaKey;
    this.previousOwner = fields.previousOwner;
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

  static restResourcePathConflict(ctx: {
    pluginId: string;
    otherPluginId: string;
    method: string;
    path: string;
  }): AppBootError {
    return new AppBootError(
      "rest_resource_path_conflict",
      `Plugin "${ctx.pluginId}" registers REST resource "${ctx.method} ${ctx.path}" ` +
        `already registered by "${ctx.otherPluginId}".`,
      { pluginId: ctx.pluginId, previousOwner: ctx.otherPluginId },
    );
  }

  static restResourceShadowsCore(ctx: {
    pluginId: string;
    method: string;
    path: string;
  }): AppBootError {
    return new AppBootError(
      "rest_resource_shadows_core",
      `Plugin "${ctx.pluginId}" REST resource "${ctx.method} ${ctx.path}" ` +
        `shadows a reserved core path.`,
      { pluginId: ctx.pluginId },
    );
  }
}
