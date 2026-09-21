import type { ReactNode } from "react";

interface ChipsProps {
  readonly items: readonly string[];
  readonly className?: string;
  readonly testId?: string;
}

export function Chips({
  items,
  className = "",
  testId,
}: ChipsProps): ReactNode {
  return (
    <ul
      translate="no"
      className={`flex flex-wrap gap-2 ${className}`}
      data-testid={testId}
    >
      {items.map((item) => (
        <li
          key={item}
          className="border-line text-ink/80 rounded-full border bg-white/60 px-3 py-1 font-mono text-xs"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}
