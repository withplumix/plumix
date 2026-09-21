import type { ThemeTokens } from "plumix/blocks";

// Warm paper and ink with one plum accent: a publishing tool should read like
// print, not like the dark infrastructure pages the category defaults to.
export const TOKENS = {
  color: {
    paper: { value: "#f7f4ee", label: "Paper" },
    ink: { value: "#1a1714", label: "Ink" },
    muted: { value: "#6b645b", label: "Muted" },
    accent: { value: "#8a2c5e", label: "Accent" },
    line: { value: "#e4ddd2", label: "Hairline" },
  },
  fontFamily: {
    serif: {
      value:
        '"Iowan Old Style", Charter, "Palatino Linotype", Georgia, "Times New Roman", serif',
      label: "Serif display",
    },
    sans: {
      value:
        'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      label: "Sans body",
    },
    mono: {
      value: 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace',
      label: "Mono",
    },
  },
} satisfies ThemeTokens;
