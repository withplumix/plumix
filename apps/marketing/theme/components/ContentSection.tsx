import type { ReactNode } from "react";

import EVENTS from "../../snippets/events.ts?raw";
import THEME from "../../snippets/theme.tsx?raw";
import { Chips } from "./Chips";
import { CodePanel } from "./CodePanel";
import { SectionHeading } from "./SectionHeading";

// The single-value builders from core's field-type roster, plus the media
// plugin's `media`. The `*List` variants are left out to keep the row short.
const FIELD_TYPES = [
  "text",
  "textarea",
  "email",
  "url",
  "password",
  "date",
  "datetime",
  "time",
  "number",
  "color",
  "range",
  "json",
  "select",
  "toggle",
  "richtext",
  "repeater",
  "group",
  "link",
  "entry",
  "term",
  "user",
  "media",
];

export function ContentSection(): ReactNode {
  return (
    <section
      className="border-line border-t py-24 md:py-32"
      data-testid="content-section"
    >
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-12 px-6 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-5">
          <SectionHeading
            eyebrow="Content"
            title={
              <>
                Content types are code <em>you can review.</em>
              </>
            }
          >
            <p>
              A plugin declares an entry type and its fields. The admin builds
              the edit screen from that declaration, and the same declaration
              types every read in your theme.
            </p>
          </SectionHeading>
          <Chips items={FIELD_TYPES} className="mt-10" testId="field-types" />
        </div>
        <CodePanel
          filename="plugins/events.ts"
          source={EVENTS}
          className="motion-reveal lg:col-span-7"
        />
      </div>

      <div className="mx-auto mt-24 grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-12 px-6 lg:grid-cols-12 lg:gap-8">
        <div className="lg:order-2 lg:col-span-5 lg:col-start-8">
          <SectionHeading
            eyebrow="Themes"
            title={
              <>
                Templates are React, and they <em>know your fields.</em>
              </>
            }
          >
            <p>
              A theme picks a template per entry type. <code>entry.meta</code>{" "}
              is typed from the plugin above, so a misspelt field fails the
              typecheck instead of rendering blank.
            </p>
          </SectionHeading>
        </div>
        <div className="lg:order-1 lg:col-span-7">
          <CodePanel
            filename="theme.tsx"
            source={THEME}
            className="motion-reveal"
          />
          {/* Verbatim from `tsc` after renaming `venue` to `venu` in the
              snippet, trimmed to the sentence a reader needs. */}
          <p
            className="motion-reveal motion-reveal-late border-accent/30 bg-accent/5 text-ink mt-4 rounded-lg border px-4 py-3 font-mono text-xs leading-relaxed"
            data-testid="type-error"
          >
            <span className="text-accent">error TS2551:</span> Property
            &apos;venu&apos; does not exist on type &hellip;. Did you mean
            &apos;venue&apos;?
          </p>
        </div>
      </div>
    </section>
  );
}
