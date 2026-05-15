type ScaffoldErrorCode =
  | "target_parent_missing"
  | "target_not_directory"
  | "target_directory_not_empty"
  | "catalog_resolution_missing";

interface ScaffoldErrorFields {
  parent?: string;
  targetDir?: string;
  catalogName?: string;
}

export class ScaffoldError extends Error {
  static {
    ScaffoldError.prototype.name = "ScaffoldError";
  }

  readonly code: ScaffoldErrorCode;
  readonly parent: string | undefined;
  readonly targetDir: string | undefined;
  readonly catalogName: string | undefined;

  private constructor(
    code: ScaffoldErrorCode,
    message: string,
    fields: ScaffoldErrorFields,
  ) {
    super(message);
    this.code = code;
    this.parent = fields.parent;
    this.targetDir = fields.targetDir;
    this.catalogName = fields.catalogName;
  }

  static targetParentMissing(ctx: { parent: string }): ScaffoldError {
    return new ScaffoldError(
      "target_parent_missing",
      `Target parent directory does not exist: ${ctx.parent}. Create the parent first, or pick a target inside an existing directory.`,
      ctx,
    );
  }

  static targetNotDirectory(ctx: { targetDir: string }): ScaffoldError {
    return new ScaffoldError(
      "target_not_directory",
      `Target path exists but is not a directory: ${ctx.targetDir}. Pick a target that is either a fresh path or an empty directory.`,
      ctx,
    );
  }

  static targetDirectoryNotEmpty(ctx: { targetDir: string }): ScaffoldError {
    return new ScaffoldError(
      "target_directory_not_empty",
      `Target directory is not empty: ${ctx.targetDir}. Pick a fresh path, or empty the existing one first.`,
      ctx,
    );
  }

  static catalogResolutionMissing(ctx: { catalogName: string }): ScaffoldError {
    return new ScaffoldError(
      "catalog_resolution_missing",
      `No catalog resolution for "${ctx.catalogName}" — add it to CATALOG_RESOLUTIONS in scaffold.ts.`,
      ctx,
    );
  }
}
