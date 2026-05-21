import type { ReactElement } from "react";
import { useId } from "react";

import type { ThemeTokenGroup } from "@plumix/blocks";

interface TokenSwatchListProps {
  readonly tokens: ThemeTokenGroup;
  readonly value: string;
  readonly onChange: (next: string | undefined) => void;
  readonly testIdPrefix: string;
  readonly ariaLabel: string;
}

export function TokenSwatchList({
  tokens,
  value,
  onChange,
  testIdPrefix,
  ariaLabel,
}: TokenSwatchListProps): ReactElement {
  const name = useId();
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex flex-wrap gap-1"
      data-testid={`${testIdPrefix}-list`}
    >
      <label className="inline-flex items-center rounded border px-2 py-1 text-xs">
        <input
          type="radio"
          name={name}
          value=""
          checked={value === ""}
          onChange={() => onChange(undefined)}
          className="sr-only"
          data-testid={`${testIdPrefix}-clear`}
        />
        None
      </label>
      {Object.entries(tokens).map(([id, entry]) => (
        <label
          key={id}
          className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs"
        >
          <input
            type="radio"
            name={name}
            value={id}
            checked={value === id}
            onChange={() => onChange(id)}
            className="sr-only"
            data-testid={`${testIdPrefix}-token-${id}`}
          />
          <span
            className="size-3 rounded border"
            style={{ backgroundColor: entry.value }}
            data-testid={`${testIdPrefix}-swatch-${id}`}
          />
          {entry.label ?? id}
        </label>
      ))}
    </div>
  );
}
