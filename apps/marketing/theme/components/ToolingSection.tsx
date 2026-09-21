import type { ReactNode } from "react";

import { SectionHeading } from "./SectionHeading";

interface ShotProps {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
  readonly testId: string;
}

function Shot({ src, width, height, alt, testId }: ShotProps): ReactNode {
  return (
    <figure
      className="motion-reveal overflow-hidden rounded-xl bg-[#1d1a17] shadow-[0_30px_60px_-30px_rgba(26,23,20,0.45)]"
      data-testid={testId}
    >
      <img
        src={src}
        width={width}
        height={height}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="block h-auto w-full"
      />
    </figure>
  );
}

export function ToolingSection(): ReactNode {
  return (
    <section
      className="border-line border-t py-24 md:py-32"
      data-testid="tooling-section"
    >
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="Tooling"
          title={
            <>
              When it breaks, <em>it says where.</em>
            </>
          }
        >
          <p>
            A throw in development opens a page with your frame first, the
            failing line highlighted and the request that caused it. Framework
            frames fold away, and every frame opens in your editor.
          </p>
        </SectionHeading>
        <div className="mt-12">
          <Shot
            src="/screenshots/dev-error-page.png"
            width={2790}
            height={900}
            alt="The plumix development error page: a TypeError, the Price component frame first, and the failing line highlighted in the source"
            testId="error-page-shot"
          />
        </div>

        <div className="mt-24 grid grid-cols-[minmax(0,1fr)] items-center gap-12 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-5">
            <h3 className="font-serif text-3xl leading-tight tracking-tight text-balance">
              Every request, <em>taken apart.</em>
            </h3>
            <p className="text-muted mt-4 text-lg leading-relaxed text-pretty">
              The debug bar sits on each page you open in development: the
              request, the template that rendered it, every query with its
              timing, and a timeline of hooks and renders. None of it ships to
              production.
            </p>
          </div>
          <div className="lg:col-span-6 lg:col-start-7">
            <Shot
              src="/screenshots/debug-bar-timeline.png"
              width={879}
              height={540}
              alt="The plumix debug bar's timeline panel: dispatch, resolve, render, a hook and three database selects with their durations"
              testId="debug-bar-shot"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
