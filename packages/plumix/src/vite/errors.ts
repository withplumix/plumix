type VitePluginErrorCode =
  | "admin_asset_not_found"
  | "admin_entry_and_chunk_both_set"
  | "admin_entry_outside_project_root"
  | "admin_entry_not_found";

interface VitePluginErrorFields {
  pluginId?: string;
  field?: string;
  declared?: string;
  resolved?: string;
  adminEntry?: string;
}

export class VitePluginError extends Error {
  static {
    VitePluginError.prototype.name = "VitePluginError";
  }

  readonly code: VitePluginErrorCode;
  readonly pluginId: string | undefined;
  readonly field: string | undefined;
  readonly declared: string | undefined;
  readonly resolved: string | undefined;
  readonly adminEntry: string | undefined;

  private constructor(
    code: VitePluginErrorCode,
    message: string,
    fields: VitePluginErrorFields,
  ) {
    super(message);
    this.code = code;
    this.pluginId = fields.pluginId;
    this.field = fields.field;
    this.declared = fields.declared;
    this.resolved = fields.resolved;
    this.adminEntry = fields.adminEntry;
  }

  static adminAssetNotFound(ctx: {
    pluginId: string;
    field: string;
    declared: string;
    resolved: string;
  }): VitePluginError {
    return new VitePluginError(
      "admin_asset_not_found",
      `[plumix] plugin "${ctx.pluginId}" declares ${ctx.field} "${ctx.declared}" but ` +
        `the file was not found at ${ctx.resolved}. Build the plugin's admin ` +
        `assets before running \`plumix build\`.`,
      ctx,
    );
  }

  static adminEntryAndChunkBothSet(ctx: { pluginId: string }): VitePluginError {
    return new VitePluginError(
      "admin_entry_and_chunk_both_set",
      `[plumix] plugin "${ctx.pluginId}" sets both adminEntry and adminChunk. ` +
        `Pick one — adminEntry (TS source) is preferred.`,
      ctx,
    );
  }

  static adminEntryOutsideProjectRoot(ctx: {
    pluginId: string;
    adminEntry: string;
    resolved: string;
  }): VitePluginError {
    return new VitePluginError(
      "admin_entry_outside_project_root",
      `[plumix] plugin "${ctx.pluginId}" adminEntry "${ctx.adminEntry}" ` +
        `resolves outside the project root (${ctx.resolved}). Plugin admin ` +
        `entries must live inside the consumer site's directory tree.`,
      ctx,
    );
  }

  static adminEntryNotFound(ctx: {
    pluginId: string;
    adminEntry: string;
    resolved: string;
  }): VitePluginError {
    return new VitePluginError(
      "admin_entry_not_found",
      `[plumix] plugin "${ctx.pluginId}" declares adminEntry ` +
        `"${ctx.adminEntry}" but the file was not found at ${ctx.resolved}.`,
      ctx,
    );
  }
}
