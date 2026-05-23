export class RendererError extends Error {
  static {
    RendererError.prototype.name = "RendererError";
  }

  readonly code: "missing_provider";
  readonly consumer: string;

  private constructor(
    code: "missing_provider",
    message: string,
    consumer: string,
  ) {
    super(message);
    this.code = code;
    this.consumer = consumer;
  }

  static missingProvider(ctx: { consumer: string }): RendererError {
    return new RendererError(
      "missing_provider",
      `${ctx.consumer} must be used inside a <PlumixProvider/>.`,
      ctx.consumer,
    );
  }
}
