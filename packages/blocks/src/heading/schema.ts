import { mergeAttributes, Node } from "@tiptap/core";

const LEVELS = [1, 2, 3, 4, 5, 6] as const;
type Level = (typeof LEVELS)[number];
const DEFAULT_LEVEL: Level = 2;

function clampLevel(raw: unknown): Level {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_LEVEL;
  const rounded = Math.trunc(n);
  if (rounded < 1) return 1;
  if (rounded > 6) return 6;
  return rounded as Level;
}

export const headingSchema = Node.create({
  name: "core/heading",
  group: "block",
  content: "inline*",
  defining: true,

  addAttributes() {
    return {
      level: {
        default: DEFAULT_LEVEL,
        parseHTML: (el) => clampLevel(el.tagName.replace(/^H/i, "")),
        // Suppress the default `level="N"` HTML attribute — the tag itself encodes it.
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return LEVELS.map((level) => ({ tag: `h${level}` }));
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      `h${clampLevel(node.attrs.level)}`,
      mergeAttributes(HTMLAttributes),
      0,
    ];
  },
});
