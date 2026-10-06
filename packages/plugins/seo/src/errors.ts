type SeoErrorCode = "reserved_sitemap_scope" | "unknown_sitemap_policy_key";

interface SeoErrorFields {
  scope?: string;
  pluginId?: string;
  key?: string;
}

export class SeoError extends Error {
  static {
    SeoError.prototype.name = "SeoError";
  }

  readonly code: SeoErrorCode;
  readonly scope: string | undefined;
  readonly pluginId: string | undefined;
  readonly key: string | undefined;

  private constructor(
    code: SeoErrorCode,
    message: string,
    fields: SeoErrorFields,
  ) {
    super(message);
    this.code = code;
    this.scope = fields.scope;
    this.pluginId = fields.pluginId;
    this.key = fields.key;
  }

  /**
   * A plugin's archive contributes a sitemap scope under a name seo keeps for
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
        `never apply. A scope is a public entry type or taxonomy, or an ` +
        `archive that declares a \`sitemap\`, with no access policy.`,
      ctx,
    );
  }
}
