import type { ReactElement } from "react";
import { useMemo } from "react";

import type { PatternManifestEntry } from "@plumix/core/manifest";

interface PatternsSectionProps {
  readonly patterns: readonly PatternManifestEntry[];
  readonly onSelect: (pattern: PatternManifestEntry) => void;
}

const UNCATEGORIZED = "uncategorized";

export function PatternsSection({
  patterns,
  onSelect,
}: PatternsSectionProps): ReactElement | null {
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
        Patterns
      </h3>
      {Array.from(grouped.entries()).map(([category, entries]) => (
        <div
          key={category}
          data-testid={`plumix-patterns-group-${category}`}
          className="flex flex-col gap-1"
        >
          <h4 className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
            {category}
          </h4>
          <ul className="flex flex-col gap-1">
            {entries.map((entry) => (
              <li key={entry.name}>
                <button
                  type="button"
                  className="text-foreground hover:bg-muted w-full rounded border px-3 py-2 text-left text-sm"
                  data-testid={`plumix-patterns-row-${entry.name}`}
                  onClick={() => onSelect(entry)}
                >
                  {entry.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
