type SeoErrorCode =
  | "duplicate_sitemap_scope"
  | "reserved_sitemap_scope"
  | "unknown_sitemap_policy_key"
  | "unknown_index_view";

interface SeoErrorFields {
  scope?: string;
  pluginId?: string;
  existingPluginId?: string;
  key?: string;
  view?: string;
}

export class SeoError extends Error {
  static {
    SeoError.prototype.name = "SeoError";
  }

  readonly code: SeoErrorCode;
  readonly scope: string | undefined;
  readonly pluginId: string | undefined;
  readonly existingPluginId: string | undefined;
  readonly key: string | undefined;
  readonly view: string | undefined;

  private constructor(
    code: SeoErrorCode,
    message: string,
    fields: SeoErrorFields,
  ) {
    super(message);
    this.code = code;
    this.scope = fields.scope;
    this.pluginId = fields.pluginId;
    this.existingPluginId = fields.existingPluginId;
    this.key = fields.key;
    this.view = fields.view;
  }

  /**
   * A second plugin contributes a sitemap scope under a name another already
   * holds, so two sources would answer at one URL. Raised at boot, naming
   * both plugins.
   */
  static duplicateSitemapScope(ctx: {
    scope: string;
    pluginId: string;
    existingPluginId: string;
  }): SeoError {
    return new SeoError(
      "duplicate_sitemap_scope",
      `seo: plugin "${ctx.pluginId}" contributes the sitemap scope ` +
        `"${ctx.scope}", which plugin "${ctx.existingPluginId}" already ` +
        `contributes. Rename one of them.`,
      ctx,
    );
  }

  /**
   * A plugin contributes a sitemap scope under a name seo keeps for
   * its own entry-type and taxonomy scopes. Raised at boot, naming the plugin,
   * so the name can be changed before any route answers for it.
   */
  static reservedSitemapScope(ctx: {
    scope: string;
    pluginId: string;
  }): SeoError {
    return new SeoError(
      "reserved_sitemap_scope",
      `seo: plugin "${ctx.pluginId}" contributes the sitemap scope ` +
        `"${ctx.scope}", but "entries" and "terms", and any name starting ` +
        `"entries-" or "terms-", are reserved for seo's entry-type and ` +
        `taxonomy scopes. Rename it.`,
      ctx,
    );
  }

  /**
   * The site's `sitemaps` option names no sitemap scope — nothing by that
   * name, or a registration the sitemap never lists — so its policy would
   * never apply. `key` is the path as written in the option, such as
   * `entries.post` or `location`.
   */
  static unknownSitemapPolicyKey(ctx: { key: string }): SeoError {
    return new SeoError(
      "unknown_sitemap_policy_key",
      `seo: sitemaps.${ctx.key} names no sitemap scope, so its policy would ` +
        `never apply. A scope is a public entry type or taxonomy with no ` +
        `access policy, or one a plugin contributes with \`registerSitemap\`.`,
      ctx,
    );
  }

  /**
   * The site's `indexViews` option names a view no plugin registered, so the
   * page it meant to offer would stay `noindex`. Raised at boot, naming it.
   */
  static unknownIndexView(ctx: { view: string }): SeoError {
    return new SeoError(
      "unknown_index_view",
      `seo: indexViews names "${ctx.view}", but no plugin registers a view ` +
        `by that name with \`registerView\`.`,
      ctx,
    );
  }
}
