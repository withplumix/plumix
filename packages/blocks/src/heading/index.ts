import { defineBlock } from "../define-block.js";

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;

export const headingBlock = defineBlock({
  name: "core/heading",
  title: "Heading",
  category: "text",
  description: "Section title.",
  legacyAliases: ["heading"],
  attributes: {
    level: {
      type: "select",
      label: "Heading level",
      default: 2,
      options: HEADING_LEVELS.map((level) => ({
        value: level,
        label: `H${level}`,
      })),
    },
  },
  keyboardShortcuts: HEADING_LEVELS.map((level) => ({
    shortcut: `Mod-Alt-${level}`,
    attrs: { level },
  })),
  markdownShortcuts: HEADING_LEVELS.map((level) => ({
    pattern: `${"#".repeat(level)} `,
    attrs: { level },
  })),
  parsePaste: HEADING_LEVELS.map((level) => ({
    selector: `h${level}`,
    fromHTML: () => ({ level }),
  })),
  schema: () => import("./schema.js").then((m) => m.headingSchema),
  component: () => import("./Component.js").then((m) => m.HeadingComponent),
});
