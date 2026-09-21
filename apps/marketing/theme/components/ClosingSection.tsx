import type { ReactNode } from "react";

import { LINKS } from "../links";
import { InstallCommand } from "./InstallCommand";

export function ClosingSection(): ReactNode {
  return (
    <section
      className="border-line border-t py-24 md:py-32"
      data-testid="closing-section"
    >
      <div className="mx-auto max-w-6xl px-6 text-center">
        <h2 className="font-serif text-5xl leading-[1.05] tracking-tight md:text-6xl">
          Start a site. <em className="text-accent">Keep the code.</em>
        </h2>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-4">
          <InstallCommand />
          <a
            href={LINKS.demo}
            className="text-accent text-sm font-medium hover:underline"
          >
            Try the editor first <span aria-hidden="true">→</span>
          </a>
        </div>
      </div>
    </section>
  );
}
