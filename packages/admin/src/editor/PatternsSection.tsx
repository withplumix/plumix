import type { MessageDescriptor } from "@lingui/core";
import type { ReactElement } from "react";
import { useMemo } from "react";
import { useLabel } from "@/lib/use-label.js";
import { defineMessage } from "@lingui/core/macro";
import { Trans } from "@lingui/react";

import type { BlockRegistry, PatternRegistry } from "@plumix/blocks";
import type { PatternManifestEntry } from "@plumix/core/manifest";

import { LazyMount } from "./LazyMount.js";
import { PatternThumbnail } from "./PatternThumbnail.js";
import { THUMBNAIL_MIN_HEIGHT } from "./thumbnail-min-height.js";

interface PatternsSectionProps {
  readonly patterns: readonly PatternManifestEntry[];
  readonly onSelect: (pattern: PatternManifestEntry) => void;
  readonly blocks: BlockRegistry;
  readonly patternRegistry: PatternRegistry;
}

// Sort-stable sentinel for patterns missing a category. Compared by
// identity in the bucket Map; the visible heading uses
// `M.uncategorized` so the rendered label localizes.
const UNCATEGORIZED = "uncategorized";

const M = {
  uncategorized: defineMessage({
    id: "patternsSection.uncategorized",
    message: "Uncategorized",
  }),
} satisfies Record<string, MessageDescriptor>;

export function PatternsSection({
  patterns,
  onSelect,
  blocks,
  patternRegistry,
}: PatternsSectionProps): ReactElement | null {
  const label = useLabel();
  const grouped = useMemo(() => {
    const map = new Map<string, PatternManifestEntry[]>();
    for (const pattern of patterns) {
      const key = pattern.category ?? UNCATEGORIZED;
      const bucket = map.get(key);
      if (bucket) {
        bucket.push(pattern);
      } else {
        map.set(key, [pattern]);
      }
    }
    return map;
  }, [patterns]);

  if (patterns.length === 0) return null;

  return (
    <section
      className="flex flex-col gap-3 border-t p-4"
      data-testid="plumix-patterns-section"
    >
      <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        <Trans id="patternsSection.heading" message="Patterns" />
      </h3>
      {Array.from(grouped.entries()).map(([category, entries]) => (
        <div
          key={category}
          data-testid={`plumix-patterns-group-${category}`}
          className="flex flex-col gap-1"
        >
          <h4 className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
            {category === UNCATEGORIZED ? label(M.uncategorized) : category}
          </h4>
          <ul className="flex flex-col gap-1">
            {entries.map((entry) => (
              <li key={entry.name}>
                {/* `<div role="button">` rather than `<button>` because
                    the live thumbnail can render its own interactive
                    HTML — nested <button>/<a> in a real <button> is
                    invalid and the inner element steals focus. */}
                <div
                  role="button"
                  tabIndex={0}
                  className="text-foreground hover:bg-muted flex w-full flex-col gap-1 rounded border p-2 text-left text-sm focus:outline-none focus-visible:ring"
                  data-testid={`plumix-patterns-row-${entry.name}`}
                  onClick={() => onSelect(entry)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(entry);
                    }
                  }}
                >
                  <LazyMount
                    placeholderTestId={`plumix-patterns-row-placeholder-${entry.name}`}
                    minHeight={THUMBNAIL_MIN_HEIGHT}
                  >
                    <div className="overflow-hidden rounded">
                      <PatternThumbnail
                        pattern={entry}
                        blocks={blocks}
                        patterns={patternRegistry}
                      />
                    </div>
                  </LazyMount>
                  <span className="truncate">{entry.title}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
