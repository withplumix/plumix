type RouteCompileErrorCode =
  "invalid_archive_slug" | "invalid_rewrite_slug" | "duplicate_rewrite_rule";

export type RegistrationKind = "entry_type" | "term_taxonomy";

const REGISTRATION_LABEL: Record<RegistrationKind, string> = {
  entry_type: "Entry type",
  term_taxonomy: "Term taxonomy",
};

export class RouteCompileError extends Error {
  static {
    RouteCompileError.prototype.name = "RouteCompileError";
  }

  readonly code: RouteCompileErrorCode;
  readonly entryType: string | undefined;
  readonly hasArchive: string | undefined;
  readonly registration: RegistrationKind | undefined;
  readonly registrationName: string | undefined;
  readonly rewriteSlug: string | undefined;
  readonly rawPattern: string | undefined;
  readonly firstOwner: string | null | undefined;
  readonly secondOwner: string | null | undefined;

  private constructor(
    code: RouteCompileErrorCode,
    message: string,
    fields: {
      entryType?: string;
      hasArchive?: string;
      registration?: RegistrationKind;
      registrationName?: string;
      rewriteSlug?: string;
      rawPattern?: string;
      firstOwner?: string | null;
      secondOwner?: string | null;
    },
  ) {
    super(message);
    this.code = code;
    this.entryType = fields.entryType;
    this.hasArchive = fields.hasArchive;
    this.registration = fields.registration;
    this.registrationName = fields.registrationName;
    this.rewriteSlug = fields.rewriteSlug;
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
      ctx,
    );
  }

  static invalidRewriteSlug(ctx: {
    registration: RegistrationKind;
    registrationName: string;
    rewriteSlug: string;
  }): RouteCompileError {
    const root =
      ctx.registration === "entry_type"
        ? ` (or "" to claim the site root)`
        : "";
    return new RouteCompileError(
      "invalid_rewrite_slug",
      `${REGISTRATION_LABEL[ctx.registration]} "${ctx.registrationName}" has ` +
        `invalid rewrite.slug "${ctx.rewriteSlug}" — expected a single ` +
        `lowercase kebab-case path segment${root}.`,
      ctx,
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
      ctx,
    );
  }
}

function formatOwner(plugin: string | null): string {
  return plugin === null ? "core" : `plugin "${plugin}"`;
}
