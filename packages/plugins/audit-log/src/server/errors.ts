type AuditLogConfigErrorCode = "invalid_retention_max_age";

/**
 * Audit-log config that would corrupt the log if accepted (a non-finite or
 * negative `maxAgeDays` puts the retention cutoff in the future or no-ops the
 * SQL). Named-error convention (#232).
 */
export class AuditLogConfigError extends Error {
  static {
    AuditLogConfigError.prototype.name = "AuditLogConfigError";
  }

  readonly code: AuditLogConfigErrorCode;

  private constructor(code: AuditLogConfigErrorCode, message: string) {
    super(message);
    this.code = code;
  }

  static invalidRetentionMaxAge(received: unknown): AuditLogConfigError {
    return new AuditLogConfigError(
      "invalid_retention_max_age",
      `[plumix/plugin-audit-log] retention.maxAgeDays must be a non-negative finite number (got ${String(received)})`,
    );
  }
}
