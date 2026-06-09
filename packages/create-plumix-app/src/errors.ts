type ScaffoldErrorCode =
  | "target_parent_missing"
  | "target_not_directory"
  | "target_directory_not_empty"
  | "catalog_resolution_missing"
  | "workspace_version_missing";

interface ScaffoldErrorFields {
  parent?: string;
  targetDir?: string;
  catalogName?: string;
  packageName?: string;
}

export class ScaffoldError extends Error {
  static {
    ScaffoldError.prototype.name = "ScaffoldError";
  }

  readonly code: ScaffoldErrorCode;
  readonly parent: string | undefined;
  readonly targetDir: string | undefined;
  readonly catalogName: string | undefined;
  readonly packageName: string | undefined;

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
    this.packageName = fields.packageName;
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
      `No catalog entry for "${ctx.catalogName}" in pnpm-workspace.yaml — the template references it via \`catalog:\` but the workspace catalog has no such key.`,
      ctx,
    );
  }

  static workspaceVersionMissing(ctx: { packageName: string }): ScaffoldError {
    return new ScaffoldError(
      "workspace_version_missing",
      `No workspace version for "${ctx.packageName}" — the template references it via \`workspace:\` but no workspace package publishes that name.`,
      ctx,
    );
  }
}
