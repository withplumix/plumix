type ScaffoldErrorCode =
  | "target_parent_missing"
  | "target_not_directory"
  | "target_directory_not_empty"
  | "catalog_resolution_missing"
  | "workspace_version_missing"
  | "unknown_template"
  | "unknown_runtime"
  | "invalid_project_name"
  | "invalid_scaffold_meta"
  | "unsupported_capability"
  | "unknown_plugin"
  | "wrangler_file_missing"
  | "snapshot_missing";

interface ScaffoldErrorFields {
  parent?: string;
  targetDir?: string;
  dependency?: string;
  catalog?: string;
  packageName?: string;
  template?: string;
  runtime?: string;
  projectName?: string;
  packagePath?: string;
  capability?: string;
  plugin?: string;
  available?: readonly string[];
}

export class ScaffoldError extends Error {
  static {
    ScaffoldError.prototype.name = "ScaffoldError";
  }

  readonly code: ScaffoldErrorCode;
  readonly parent: string | undefined;
  readonly targetDir: string | undefined;
  readonly dependency: string | undefined;
  readonly catalog: string | undefined;
  readonly packageName: string | undefined;
  readonly template: string | undefined;
  readonly runtime: string | undefined;
  readonly projectName: string | undefined;
  readonly packagePath: string | undefined;
  readonly capability: string | undefined;
  readonly plugin: string | undefined;
  readonly available: readonly string[] | undefined;

  private constructor(
    code: ScaffoldErrorCode,
    message: string,
    fields: ScaffoldErrorFields,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.code = code;
    this.parent = fields.parent;
    this.targetDir = fields.targetDir;
    this.dependency = fields.dependency;
    this.catalog = fields.catalog;
    this.packageName = fields.packageName;
    this.template = fields.template;
    this.runtime = fields.runtime;
    this.projectName = fields.projectName;
    this.packagePath = fields.packagePath;
    this.capability = fields.capability;
    this.plugin = fields.plugin;
    this.available = fields.available;
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

  static catalogResolutionMissing(ctx: {
    dependency: string;
    catalog: string;
  }): ScaffoldError {
    return new ScaffoldError(
      "catalog_resolution_missing",
      `No "${ctx.dependency}" entry in the "${ctx.catalog}" catalog of pnpm-workspace.yaml — the template references it via \`catalog:\` but that catalog has no such key.`,
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

  static unknownTemplate(ctx: {
    template: string;
    available: readonly string[];
  }): ScaffoldError {
    return new ScaffoldError(
      "unknown_template",
      `Unknown template "${ctx.template}". Available templates: ${ctx.available.join(", ")}.`,
      ctx,
    );
  }

  static unknownRuntime(ctx: {
    runtime: string;
    available: readonly string[];
  }): ScaffoldError {
    return new ScaffoldError(
      "unknown_runtime",
      `Unknown runtime "${ctx.runtime}". Available runtimes: ${ctx.available.join(", ")}.`,
      ctx,
    );
  }

  static invalidProjectName(ctx: { name: string }): ScaffoldError {
    return new ScaffoldError(
      "invalid_project_name",
      `Invalid project name "${ctx.name}". Use a valid npm package name: lowercase letters, digits, and "-", "_", "." (no spaces or other characters), starting with a letter or digit.`,
      { projectName: ctx.name },
    );
  }

  static invalidScaffoldMeta(ctx: {
    packagePath: string;
    reason: string;
  }): ScaffoldError {
    return new ScaffoldError(
      "invalid_scaffold_meta",
      `Invalid plumix.scaffold in ${ctx.packagePath}: ${ctx.reason}`,
      { packagePath: ctx.packagePath },
    );
  }

  static unsupportedCapability(ctx: {
    capability: string;
    plugin: string;
    runtime: string;
  }): ScaffoldError {
    return new ScaffoldError(
      "unsupported_capability",
      `Plugin "${ctx.plugin}" needs the "${ctx.capability}" capability, which the "${ctx.runtime}" runtime does not provide.`,
      ctx,
    );
  }

  static unknownPlugin(ctx: {
    plugin: string;
    available: readonly string[];
  }): ScaffoldError {
    return new ScaffoldError(
      "unknown_plugin",
      `Unknown plugin "${ctx.plugin}". Available plugins: ${ctx.available.join(", ")}.`,
      ctx,
    );
  }

  static wranglerFileMissing(ctx: { runtime: string }): ScaffoldError {
    return new ScaffoldError(
      "wrangler_file_missing",
      `The "${ctx.runtime}" runtime contributes wrangler bindings but provides no wrangler.jsonc to merge them into.`,
      ctx,
    );
  }

  static snapshotMissing(ctx: {
    path: string;
    cause?: unknown;
  }): ScaffoldError {
    return new ScaffoldError(
      "snapshot_missing",
      `Could not read or parse the bundled registry snapshot at ${ctx.path}. This is a packaging bug — please report it.`,
      { packagePath: ctx.path },
      { cause: ctx.cause },
    );
  }
}
