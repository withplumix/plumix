import type { EntryData, ResolvedEntryFor } from "plumix/theme";
import { defineTemplate, defineTheme, forEntryType } from "plumix/theme";

const event = defineTemplate<EntryData<ResolvedEntryFor<"event">>>({
  render: ({ data: { entry } }) => (
    <article>
      <h1>{entry.title}</h1>
      <p>
        {entry.meta.venue} · {entry.meta.startsOn}
      </p>
      {entry.meta.capacity ? <p>{entry.meta.capacity} seats</p> : null}
    </article>
  ),
});

export const theme = defineTheme({
  templates: [forEntryType("event").template(event)],
});
