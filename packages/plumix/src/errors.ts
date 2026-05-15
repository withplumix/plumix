export class AdminRuntimeError extends Error {
  static {
    AdminRuntimeError.prototype.name = "AdminRuntimeError";
  }

  readonly code: "not_initialised";

  private constructor(code: "not_initialised", message: string) {
    super(message);
    this.code = code;
  }

  static notInitialised(): AdminRuntimeError {
    return new AdminRuntimeError(
      "not_initialised",
      "plumix admin runtime not initialised — plugin chunk loaded before host bundle.",
    );
  }
}
