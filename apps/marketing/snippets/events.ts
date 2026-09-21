import type { ResolvedEntry } from "plumix";
import type { EntryMeta } from "plumix/plugin";
import { date, number, select, text } from "plumix/fields";
import { definePlugin } from "plumix/plugin";

const eventFields = [
  text("venue").required(),
  date("startsOn").required(),
  number("capacity").min(1),
  select("format").options(["in-person", "online"]).default("in-person"),
];

declare module "plumix" {
  interface EntryTypeRegistry {
    event: { entry: ResolvedEntry };
  }
  interface EntryMetaContributions {
    "event-details": EntryMeta<"event", typeof eventFields>;
  }
}

export const events = definePlugin("events", {
  setup: (ctx) => {
    ctx.registerEntryType("event", { label: "Events", hasArchive: true });
    ctx.registerEntryMetaBox("event-details", {
      label: "Event details",
      entryTypes: ["event"],
      fields: eventFields,
    });
  },
});
