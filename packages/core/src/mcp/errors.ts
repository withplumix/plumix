// The service-layer slices (#932/#933) extend this taxonomy as tools start
// throwing the other conditions; #931 only needs not_found for schema_describe.
type McpToolErrorCode = "not_found";

/**
 * Domain error a tool's `run` throws to signal a caller-facing condition. The
 * call-tool handler maps these to MCP error envelopes ({@link toToolErrorResult});
 * anything else propagates as a protocol-level JSON-RPC error.
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
}

// The index signature keeps this assignable to the SDK's `CallToolResult`,
// which carries `[x: string]: unknown` for protocol passthrough fields.
interface McpToolErrorResult {
  readonly isError: true;
  readonly content: { readonly type: "text"; readonly text: string }[];
  readonly [key: string]: unknown;
}

/**
 * Map a domain error to an MCP tool-result envelope (`isError: true`) so the
 * client sees a clear, non-crashing failure. The code is prefixed so an agent
 * can branch on it; the message carries the human-readable detail.
 */
export function toToolErrorResult(error: McpToolError): McpToolErrorResult {
  return {
    isError: true,
    content: [{ type: "text", text: `${error.code}: ${error.message}` }],
  };
}
