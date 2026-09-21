import type { ReactNode } from "react";

import { SectionHeading } from "./SectionHeading";

// Named by config slot, not by host: the adapter list grows, the slots don't.
const SLOTS = [
  {
    slot: "runtime",
    body: "How requests arrive, how scheduled tasks fire, how the site builds.",
  },
  {
    slot: "database",
    body: "Where entries, users and settings live. Plumix generates migrations from the schema your plugins declare.",
  },
  {
    slot: "storage",
    body: "Where uploads go. The media library reads through it, whatever sits behind it.",
  },
] as const;

export function HostingSection(): ReactNode {
  return (
    <section
      className="border-line border-t py-24 md:py-32"
      data-testid="hosting-section"
    >
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="Hosting"
          title={
            <>
              Your host is <em>an adapter.</em>
            </>
          }
        >
          <p>
            Three lines of config say where the site runs. Change them and the
            content model, plugins and theme stay as they are.
          </p>
        </SectionHeading>
        <dl
          className="motion-reveal border-line mt-14 grid border-t md:grid-cols-3"
          data-testid="adapter-slots"
        >
          {SLOTS.map(({ slot, body }) => (
            <div
              key={slot}
              className="border-line border-b py-8 md:border-r md:border-b-0 md:px-8 md:first:pl-0 md:last:border-r-0"
            >
              <dt className="font-mono text-sm">
                {slot}
                <span className="text-muted">: adapter()</span>
              </dt>
              <dd className="text-muted mt-3 leading-relaxed text-pretty">
                {body}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
