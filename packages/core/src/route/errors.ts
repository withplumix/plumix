export class RouteCompileError extends Error {
  static {
    RouteCompileError.prototype.name = "RouteCompileError";
  }

  readonly code: "invalid_archive_slug" | "duplicate_rewrite_rule";
  readonly entryType: string | undefined;
  readonly hasArchive: string | undefined;
  readonly rawPattern: string | undefined;
  readonly firstOwner: string | null | undefined;
  readonly secondOwner: string | null | undefined;

  private constructor(
    code: "invalid_archive_slug" | "duplicate_rewrite_rule",
    message: string,
    fields: {
      entryType?: string;
      hasArchive?: string;
      rawPattern?: string;
      firstOwner?: string | null;
      secondOwner?: string | null;
    },
  ) {
    super(message);
    this.code = code;
    this.entryType = fields.entryType;
    this.hasArchive = fields.hasArchive;
    this.rawPattern = fields.rawPattern;
    this.firstOwner = fields.firstOwner;
    this.secondOwner = fields.secondOwner;
  }

  static invalidArchiveSlug(ctx: {
    entryType: string;
    hasArchive: string;
  }): RouteCompileError {
    return new RouteCompileError(
      "invalid_archive_slug",
      `Entry type "${ctx.entryType}" has invalid hasArchive "${ctx.hasArchive}" — ` +
        `expected a single lowercase kebab-case path segment.`,
      { entryType: ctx.entryType, hasArchive: ctx.hasArchive },
    );
  }

  static duplicateRewriteRule(ctx: {
    rawPattern: string;
    firstOwner: string | null;
    secondOwner: string | null;
  }): RouteCompileError {
    return new RouteCompileError(
      "duplicate_rewrite_rule",
      `Rewrite rule "${ctx.rawPattern}" is registered twice ` +
        `(by ${formatOwner(ctx.firstOwner)} and ${formatOwner(ctx.secondOwner)}).`,
      {
        rawPattern: ctx.rawPattern,
        firstOwner: ctx.firstOwner,
        secondOwner: ctx.secondOwner,
      },
    );
  }
}

function formatOwner(plugin: string | null): string {
  return plugin === null ? "core" : `plugin "${plugin}"`;
}
