import type { NodeViewProps } from "@tiptap/react";
import type { ReactElement } from "react";
import { NodeViewWrapper } from "@tiptap/react";

// Placeholder for blocks whose `type` doesn't resolve in the registry.
// `originalType` + `payload` round-trip byte-identical through storage,
// so a plugin uninstall doesn't lose author content — the placeholder
// is a visible reminder, not a destructive operation.
export function UnknownBlockNodeView({ node }: NodeViewProps): ReactElement {
  const attrs = node.attrs as {
    originalType?: string;
    payload?: unknown;
  };
  const originalType = attrs.originalType ?? "unknown";
  const payload = attrs.payload;
  return (
    <NodeViewWrapper
      data-testid="unknown-block"
      data-plumix-unknown-block={originalType}
      role="region"
      aria-label={`Unregistered block: ${originalType}`}
      className="border-muted-foreground/40 bg-muted/30 my-2 rounded-md border border-dashed p-3"
    >
      <div className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
        <span>Unregistered block:</span>
        <code className="bg-background rounded px-1 py-0.5">
          {originalType}
        </code>
      </div>
      {payload !== null && payload !== undefined ? (
        <pre className="text-muted-foreground mt-2 overflow-x-auto text-[10px]">
          {JSON.stringify(payload, null, 2)}
        </pre>
      ) : null}
    </NodeViewWrapper>
  );
}
