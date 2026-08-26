type OgPluginErrorCode =
  "asset_layer_missing" | "font_asset_missing" | "remote_renderer_refused";

interface OgPluginErrorFields {
  path?: string;
  paths?: readonly string[];
  url?: string;
  status?: number;
}

export class OgPluginError extends Error {
  static {
    OgPluginError.prototype.name = "OgPluginError";
  }

  readonly code: OgPluginErrorCode;
  readonly path: string | undefined;
  readonly paths: readonly string[] | undefined;
  readonly url: string | undefined;
  readonly status: number | undefined;

  private constructor(
    code: OgPluginErrorCode,
    message: string,
    fields: OgPluginErrorFields,
  ) {
    super(message);
    this.code = code;
    this.path = fields.path;
    this.paths = fields.paths;
    this.url = fields.url;
    this.status = fields.status;
  }

  static assetLayerMissing(ctx: { paths: readonly string[] }): OgPluginError {
    return new OgPluginError(
      "asset_layer_missing",
      `og: fonts were declared (${ctx.paths.join(", ")}) but this runtime ` +
        `exposes no asset layer to read them from.`,
      ctx,
    );
  }

  static fontAssetMissing(ctx: {
    path: string;
    status: number;
  }): OgPluginError {
    return new OgPluginError(
      "font_asset_missing",
      `og: font "${ctx.path}" answered ${String(ctx.status)} from the asset ` +
        `layer. A card rendered without its font has no text on it, so this ` +
        `fails rather than serving one.`,
      ctx,
    );
  }

  static remoteRendererRefused(ctx: {
    url: string;
    status: number;
  }): OgPluginError {
    return new OgPluginError(
      "remote_renderer_refused",
      `og: the remote renderer at ${ctx.url} answered ${String(ctx.status)}.`,
      ctx,
    );
  }
}
