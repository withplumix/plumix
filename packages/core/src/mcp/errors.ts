type McpToolErrorCode =
  | "not_found"
  | "forbidden"
  | "bad_input"
  | "conflict"
  | "locked"
  | "invalid_content";

/**
 * Thrown by a tool's `run` for a caller-facing condition, and answered with its
 * code ({@link toToolErrorResult}). Any other error is answered with only its
 * message.
 */
export class McpToolError extends Error {
  static {
    McpToolError.prototype.name = "McpToolError";
  }

  readonly code: McpToolErrorCode;

  private constructor(code: McpToolErrorCode, message: string) {
    super(message);
    this.code = code;
  }

  static notFound(message: string): McpToolError {
    return new McpToolError("not_found", message);
  }

  static forbidden(message: string): McpToolError {
    return new McpToolError("forbidden", message);
  }

  static badInput(message: string): McpToolError {
    return new McpToolError("bad_input", message);
  }

  static conflict(message: string): McpToolError {
    return new McpToolError("conflict", message);
  }

  static locked(message: string): McpToolError {
    return new McpToolError("locked", message);
  }

  static invalidContent(message: string): McpToolError {
    return new McpToolError("invalid_content", message);
  }
}

interface McpToolErrorResult {
  readonly isError: true;
  readonly content: { readonly type: "text"; readonly text: string }[];
  readonly _meta: { readonly code: McpToolErrorCode };
  // Not JSON: this signature exists to stay assignable to the SDK's
  // `CallToolResult`, which carries `[x: string]: unknown` for protocol
  // passthrough fields we neither write nor read.
  readonly [key: string]: unknown;
}

/** The code is in the text and in `_meta.code`, so an agent can branch on it. */
export function toToolErrorResult(error: McpToolError): McpToolErrorResult {
  return {
    isError: true,
    content: [{ type: "text", text: `${error.code}: ${error.message}` }],
    _meta: { code: error.code },
  };
}
