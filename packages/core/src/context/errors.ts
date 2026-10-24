type ContextErrorCode =
  | "no_request_context"
  | "app_context_extension_shadows_builtin"
  | "cache_outside_plugin";

/**
 * Request/app-context invariant violated: an accessor outside
 * `requestStore.run()`, a malformed extension map, or `ctx.cache` outside a
 * plugin's code. Named-error convention (#232).
 */
export class ContextError extends Error {
  static {
    ContextError.prototype.name = "ContextError";
  }

  readonly code: ContextErrorCode;
  readonly key: string | undefined;

  private constructor(code: ContextErrorCode, message: string, key?: string) {
    super(message);
    this.code = code;
    this.key = key;
  }

  static noRequestContext(): ContextError {
    return new ContextError(
      "no_request_context",
      "No request context — getContext() called outside requestStore.run()",
    );
  }

  static appContextExtensionShadowsBuiltin(key: string): ContextError {
    return new ContextError(
      "app_context_extension_shadows_builtin",
      `appContextExtensions entry "${key}" shadows a built-in ` +
        `AppContext field. Reserve plugin-scoped names; built-in ` +
        `members like \`db\` and \`auth\` aren't extendable.`,
      key,
    );
  }

  static cacheOutsidePlugin(): ContextError {
    return new ContextError(
      "cache_outside_plugin",
      "ctx.cache was called outside a plugin's code, so there is no plugin " +
        "namespace to name.",
    );
  }
}
