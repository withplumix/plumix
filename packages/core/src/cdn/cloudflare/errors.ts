export class CloudflareCdnError extends Error {
  static {
    CloudflareCdnError.prototype.name = "CloudflareCdnError";
  }

  readonly code: "purge_failed";
  readonly status: number;

  private constructor(code: "purge_failed", message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }

  static purgeFailed(ctx: { status: number }): CloudflareCdnError {
    return new CloudflareCdnError(
      "purge_failed",
      `cloudflare(): purge_cache responded ${String(ctx.status)}`,
      ctx.status,
    );
  }
}
