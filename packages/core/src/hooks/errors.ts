export class HookExecutionError extends Error {
  static {
    HookExecutionError.prototype.name = "HookExecutionError";
  }

  readonly code: "async_handler_in_sync_filter";
  readonly hookName: string;

  private constructor(
    code: "async_handler_in_sync_filter",
    message: string,
    hookName: string,
  ) {
    super(message);
    this.code = code;
    this.hookName = hookName;
  }

  static asyncHandlerInSyncFilter(ctx: { name: string }): HookExecutionError {
    return new HookExecutionError(
      "async_handler_in_sync_filter",
      `Hook "${ctx.name}" registered an async handler but is invoked ` +
        `synchronously. Render-time filters must return a value (no Promise) ` +
        `because React rendering is synchronous and the registry skips ` +
        `awaiting on the sync path.`,
      ctx.name,
    );
  }
}
