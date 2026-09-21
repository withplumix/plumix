import type { ReactNode } from "react";

interface EyebrowProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export function Eyebrow({ children, className = "" }: EyebrowProps): ReactNode {
  return (
    <p
      className={`text-muted font-mono text-xs tracking-[0.14em] uppercase ${className}`}
    >
      {children}
    </p>
  );
}
