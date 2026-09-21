import type { ReactNode } from "react";

import { Eyebrow } from "./Eyebrow";

interface SectionHeadingProps {
  readonly eyebrow: string;
  readonly title: ReactNode;
  readonly children?: ReactNode;
}

export function SectionHeading({
  eyebrow,
  title,
  children,
}: SectionHeadingProps): ReactNode {
  return (
    <header className="max-w-xl">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-4 font-serif text-4xl leading-[1.08] tracking-tight text-balance md:text-5xl">
        {title}
      </h2>
      {children ? (
        <div className="text-muted mt-5 text-lg leading-relaxed text-pretty">
          {children}
        </div>
      ) : null}
    </header>
  );
}
