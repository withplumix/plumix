import type { ThemeTokens } from "@plumix/blocks";

// Editorial defaults: warm paper/ink with a single accent, a serif display
// face over a sans body. These emit `--plumix-<group>-<slug>` CSS variables
// that the theme's Tailwind config consumes (see styles.css).
export const DEFAULT_TOKENS = {
  colors: {
    paper: { value: "#fbfaf8", label: "Paper" },
    ink: { value: "#1b1a17", label: "Ink" },
    muted: { value: "#6f6b63", label: "Muted" },
    accent: { value: "#b5472d", label: "Accent" },
    line: { value: "#e7e3dc", label: "Hairline" },
  },
  typography: {
    serif: {
      value: '"Iowan Old Style", Georgia, Cambria, "Times New Roman", serif',
      label: "Serif display",
    },
    sans: {
      value:
        'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      label: "Sans body",
    },
  },
} satisfies ThemeTokens;
