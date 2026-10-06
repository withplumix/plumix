import { baseSlugProblem } from "./base-slug.js";

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

  /**
   * `rawPattern` names the framework rule that would serve the archive's URLs
   * when the slug is well-formed but taken.
   */
  static invalidArchiveSlug(ctx: {
    entryType: string;
    hasArchive: string;
    rawPattern?: string;
  }): RouteCompileError {
    const subject = `Entry type "${ctx.entryType}" has`;
    return new RouteCompileError(
      "invalid_archive_slug",
      ctx.rawPattern === undefined
        ? `${subject} invalid hasArchive "${ctx.hasArchive}": ` +
            `${baseSlugProblem(ctx.hasArchive)}. ${expectedShape("")}`
        : `${subject} hasArchive "${ctx.hasArchive}" ${collision(ctx.rawPattern)}`,
      ctx,
    );
  }

  /**
   * `rawPattern` names the framework rule that would serve the registration's
   * URLs when the slug is well-formed but taken.
   */
  static invalidRewriteSlug(ctx: {
    registration: RegistrationKind;
    registrationName: string;
    rewriteSlug: string;
    rawPattern?: string;
  }): RouteCompileError {
    const subject = `${REGISTRATION_LABEL[ctx.registration]} "${ctx.registrationName}" has`;
    const root =
      ctx.registration === "entry_type"
        ? ` (or "" to claim the site root)`
        : "";
    return new RouteCompileError(
      "invalid_rewrite_slug",
      ctx.rawPattern === undefined
        ? `${subject} invalid rewrite.slug "${ctx.rewriteSlug}": ` +
            `${baseSlugProblem(ctx.rewriteSlug)}. ${expectedShape(root)}`
        : `${subject} rewrite.slug "${ctx.rewriteSlug}" ${collision(ctx.rawPattern)}`,
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

function expectedShape(root: string): string {
  return (
    `Expected one or more lowercase kebab-case segments joined by "/"${root}, ` +
    `like "insights/category".`
  );
}

function collision(frameworkPattern: string): string {
  return (
    `that collides with the framework route "${frameworkPattern}", ` +
    `which would serve its URLs instead.`
  );
}

function formatOwner(plugin: string | null): string {
  return plugin === null ? "core" : `plugin "${plugin}"`;
}
