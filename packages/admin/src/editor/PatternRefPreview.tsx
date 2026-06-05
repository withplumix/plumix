import type { ReactElement } from "react";
import { createContext, useCallback, useContext, useMemo } from "react";
import { useLabel } from "@/lib/use-label.js";
import { Trans } from "@lingui/react";
import { useGetPuck } from "@puckeditor/core";
import { Link, Unlink } from "lucide-react";

import type { BlockRegistry, PatternRegistry } from "@plumix/blocks";
import { renderBlockTree } from "@plumix/blocks";

import { detachPatternRef } from "./detach-pattern-ref.js";

interface PatternRefContextValue {
  readonly patterns: PatternRegistry;
  readonly blocks: BlockRegistry;
}

const PatternRefContext = createContext<PatternRefContextValue | null>(null);

export function PatternRefProvider({
  value,
  children,
}: {
  readonly value: PatternRefContextValue;
  readonly children: ReactElement;
}): ReactElement {
  return (
    <PatternRefContext.Provider value={value}>
      {children}
    </PatternRefContext.Provider>
  );
}

interface PatternRefPreviewProps {
  readonly slug?: string;
  readonly id?: string;
}

export function PatternRefPreview(props: PatternRefPreviewProps): ReactElement {
  const ctx = useContext(PatternRefContext);
  const getPuck = useGetPuck();
  const renderLabel = useLabel();
  const slug = props.slug ?? "";
  const pattern = ctx?.patterns.get(slug);

  const body = useMemo(() => {
    if (!pattern || !ctx) return null;
    return renderBlockTree(pattern.content, ctx.blocks, {
      patterns: ctx.patterns,
    });
  }, [pattern, ctx]);

  const handleDetach = useCallback(() => {
    if (!ctx) return;
    getPuck().dispatch({
      type: "setData",
      data: (previous) => {
        const idx = previous.content.findIndex(
          (c) =>
            c.type === "core/pattern-ref" &&
            (c.props as { id?: string }).id === props.id,
        );
        if (idx === -1) return previous;
        return detachPatternRef(previous, idx, ctx.patterns);
      },
    });
  }, [ctx, getPuck, props.id]);

  const handleCopySlug = useCallback(() => {
    void navigator.clipboard.writeText(slug);
  }, [slug]);

  if (!pattern) {
    return (
      <div
        className="text-muted-foreground rounded border border-dashed p-4 text-sm"
        data-pattern-ref={slug}
        data-pattern-ref-state="unresolved"
        data-testid={`plumix-pattern-ref-unresolved-${slug}`}
      >
        <Trans
          id="editor.patternRef.unresolved"
          message="Pattern not registered: <code>{slug}</code>"
          values={{ slug }}
          components={{ code: <code /> }}
          comment="slug: the pattern's registered slug (e.g. 'core/three-columns'); pass through verbatim"
        />
      </div>
    );
  }

  return (
    <div
      className="relative rounded border-2 border-blue-500/30"
      data-pattern-ref={slug}
      data-pattern-ref-state="resolved"
      data-testid={`plumix-pattern-ref-${slug}`}
    >
      <div className="text-foreground flex items-center gap-2 bg-blue-500/10 px-3 py-1 text-xs">
        <Link className="h-3 w-3" aria-hidden />
        <span className="flex-1">{renderLabel(pattern.title)}</span>
        <button
          type="button"
          onClick={handleCopySlug}
          className="hover:underline"
          data-testid="plumix-pattern-ref-copy-slug"
        >
          <Trans id="editor.patternRef.openSource" message="Open source" />
        </button>
        <button
          type="button"
          onClick={handleDetach}
          className="hover:bg-background flex items-center gap-1 rounded px-2 py-0.5"
          data-testid="plumix-pattern-ref-detach"
        >
          <Unlink className="h-3 w-3" aria-hidden />
          <Trans id="editor.patternRef.detach" message="Detach" />
        </button>
      </div>
      <div className="pointer-events-none p-3">{body}</div>
    </div>
  );
}
