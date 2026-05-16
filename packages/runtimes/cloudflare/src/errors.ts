export class D1Error extends Error {
  static {
    D1Error.prototype.name = "D1Error";
  }

  readonly code: "binding_missing";
  readonly binding: string;

  private constructor(
    code: "binding_missing",
    message: string,
    binding: string,
  ) {
    super(message);
    this.code = code;
    this.binding = binding;
  }

  static bindingMissing(ctx: { binding: string }): D1Error {
    return new D1Error(
      "binding_missing",
      `@plumix/runtime-cloudflare: D1 binding "${ctx.binding}" missing from env`,
      ctx.binding,
    );
  }
}

export class R2Error extends Error {
  static {
    R2Error.prototype.name = "R2Error";
  }

  readonly code: "env_not_object" | "binding_missing";
  readonly binding: string | undefined;

  private constructor(
    code: "env_not_object" | "binding_missing",
    message: string,
    binding: string | undefined,
  ) {
    super(message);
    this.code = code;
    this.binding = binding;
  }

  static envNotObject(): R2Error {
    return new R2Error(
      "env_not_object",
      "r2(): env is not an object — runtime adapter misconfiguration.",
      undefined,
    );
  }

  static bindingMissing(ctx: { binding: string }): R2Error {
    return new R2Error(
      "binding_missing",
      `r2(): env binding "${ctx.binding}" is missing or not an R2 bucket. ` +
        `Declare it in wrangler.toml and ensure the name matches.`,
      ctx.binding,
    );
  }
}

export class CfAccessError extends Error {
  static {
    CfAccessError.prototype.name = "CfAccessError";
  }

  readonly code: "invalid_team_domain" | "audience_empty";
  readonly teamDomain: string | undefined;

  private constructor(
    code: "invalid_team_domain" | "audience_empty",
    message: string,
    teamDomain: string | undefined,
  ) {
    super(message);
    this.code = code;
    this.teamDomain = teamDomain;
  }

  static invalidTeamDomain(ctx: { teamDomain: string }): CfAccessError {
    return new CfAccessError(
      "invalid_team_domain",
      `cfAccess: teamDomain must match "<team>.cloudflareaccess.com" — ` +
        `got "${ctx.teamDomain}". Strip any "https://" prefix or path; ` +
        `the helper composes the full URL.`,
      ctx.teamDomain,
    );
  }

  static audienceEmpty(): CfAccessError {
    return new CfAccessError(
      "audience_empty",
      `cfAccess: audience must be non-empty (the AUD tag from the ` +
        `application's CF Access dashboard). An empty value would ` +
        `disable per-application audience binding.`,
      undefined,
    );
  }
}

export class SigV4Error extends Error {
  static {
    SigV4Error.prototype.name = "SigV4Error";
  }

  readonly code: "expires_in_out_of_range";
  readonly expiresIn: number;

  private constructor(
    code: "expires_in_out_of_range",
    message: string,
    expiresIn: number,
  ) {
    super(message);
    this.code = code;
    this.expiresIn = expiresIn;
  }

  static expiresInOutOfRange(ctx: { expiresIn: number }): SigV4Error {
    return new SigV4Error(
      "expires_in_out_of_range",
      `presignPutUrl: expiresIn must be in [1..604800] seconds, got ${String(ctx.expiresIn)}`,
      ctx.expiresIn,
    );
  }
}

type PlumixRuntimeConfigErrorCode =
  | "bindings_missing"
  | "async_local_storage_missing";

export class PlumixRuntimeConfigError extends Error {
  static {
    PlumixRuntimeConfigError.prototype.name = "PlumixRuntimeConfigError";
  }

  readonly code: PlumixRuntimeConfigErrorCode;
  readonly missing: readonly string[];

  private constructor(
    code: PlumixRuntimeConfigErrorCode,
    message: string,
    missing: readonly string[],
  ) {
    super(message);
    this.code = code;
    this.missing = missing;
  }

  static bindingsMissing(ctx: {
    missing: readonly string[];
  }): PlumixRuntimeConfigError {
    return new PlumixRuntimeConfigError(
      "bindings_missing",
      `@plumix/runtime-cloudflare: missing required env bindings: ${ctx.missing.join(", ")}. Declare them in wrangler.toml and ensure the names match the adapter config.`,
      ctx.missing,
    );
  }

  static asyncLocalStorageMissing(): PlumixRuntimeConfigError {
    return new PlumixRuntimeConfigError(
      "async_local_storage_missing",
      '@plumix/runtime-cloudflare requires AsyncLocalStorage. Add `compatibility_flags = ["nodejs_compat"]` to wrangler.toml.',
      [],
    );
  }
}

export class WranglerConfigError extends Error {
  static {
    WranglerConfigError.prototype.name = "WranglerConfigError";
  }

  readonly code: "parse_failed";
  readonly filename: string;
  readonly errorCount: number;

  private constructor(
    code: "parse_failed",
    message: string,
    filename: string,
    errorCount: number,
  ) {
    super(message);
    this.code = code;
    this.filename = filename;
    this.errorCount = errorCount;
  }

  static parseFailed(ctx: {
    filename: string;
    errorCount: number;
  }): WranglerConfigError {
    return new WranglerConfigError(
      "parse_failed",
      `Failed to parse ${ctx.filename}: ${String(ctx.errorCount)} syntax error(s)`,
      ctx.filename,
      ctx.errorCount,
    );
  }
}
