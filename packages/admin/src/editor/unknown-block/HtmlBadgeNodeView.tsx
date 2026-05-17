import type { NodeViewProps } from "@tiptap/react";
import type { ReactElement } from "react";
import { NodeViewWrapper } from "@tiptap/react";

// Editor-only preview. The actual sanitized output is produced by the
// frontend Component on render; here we show a placeholder + length
// hint so the author doesn't have to trust raw markup at edit time.
export function HtmlBadgeNodeView({ node }: NodeViewProps): ReactElement {
  const html = (node.attrs as { html?: unknown }).html;
  const raw = typeof html === "string" ? html : "";
  return (
    <NodeViewWrapper
      data-testid="html-block-editor"
      data-plumix-block="core/html"
      role="region"
      aria-label="Raw HTML block"
      className="my-2 rounded-md border border-amber-500/40 bg-amber-50/40 p-3"
    >
      <div
        data-testid="html-block-badge"
        className="mb-2 inline-flex items-center gap-1 rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-amber-800 uppercase"
      >
        Raw HTML
      </div>
      <div className="text-muted-foreground text-xs">
        {raw === "" ? "(empty)" : summarize(raw)}
      </div>
    </NodeViewWrapper>
  );
}

function summarize(raw: string): string {
  const flat = raw.replace(/\s+/g, " ").trim();
  return flat.length > 80 ? `${flat.slice(0, 80)}…` : flat;
}
