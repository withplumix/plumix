type ContextErrorCode =
  "no_request_context" | "app_context_extension_shadows_builtin";

/**
 * Request/app-context invariant violated. `no_request_context` means an
 * accessor ran outside `requestStore.run()`; the shadow code means a
 * malformed extension map reached context assembly. Named-error convention
 * (#232).
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
}
