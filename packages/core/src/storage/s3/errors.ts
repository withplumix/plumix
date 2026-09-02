export class SigV4Error extends Error {
  static {
    SigV4Error.prototype.name = "SigV4Error";
  }

  readonly code: "expires_in_out_of_range" | "key_not_addressable";
  readonly expiresIn: number | undefined;
  readonly key: string | undefined;

  private constructor(
    code: "expires_in_out_of_range" | "key_not_addressable",
    message: string,
    fields: { expiresIn?: number; key?: string },
  ) {
    super(message);
    this.code = code;
    this.expiresIn = fields.expiresIn;
    this.key = fields.key;
  }

  static expiresInOutOfRange(ctx: { expiresIn: number }): SigV4Error {
    return new SigV4Error(
      "expires_in_out_of_range",
      `presignPutUrl: expiresIn must be in [1..604800] seconds, got ${String(ctx.expiresIn)}`,
      ctx,
    );
  }

  static keyNotAddressable(ctx: { key: string }): SigV4Error {
    return new SigV4Error(
      "key_not_addressable",
      `object key "${ctx.key}" has a "." or ".." segment, which URL ` +
        `normalisation would re-route to a different path before signing`,
      ctx,
    );
  }
}

export class S3Error extends Error {
  static {
    S3Error.prototype.name = "S3Error";
  }

  readonly code: "request_failed";
  readonly method: string;
  readonly key: string | undefined;
  readonly status: number;
  /** The `<Code>` of the S3 error document, when the response carried one. */
  readonly s3Code: string | undefined;

  private constructor(
    code: "request_failed",
    message: string,
    fields: {
      method: string;
      key: string | undefined;
      status: number;
      s3Code: string | undefined;
    },
  ) {
    super(message);
    this.code = code;
    this.method = fields.method;
    this.key = fields.key;
    this.status = fields.status;
    this.s3Code = fields.s3Code;
  }

  static requestFailed(ctx: {
    method: string;
    key: string | undefined;
    status: number;
    s3Code: string | undefined;
  }): S3Error {
    const target = ctx.key === undefined ? "the bucket" : `"${ctx.key}"`;
    const detail = ctx.s3Code === undefined ? "" : ` (${ctx.s3Code})`;
    return new S3Error(
      "request_failed",
      `s3(): ${ctx.method} ${target} failed with HTTP ${String(ctx.status)}${detail}`,
      ctx,
    );
  }
}
