import { defineBlock } from "../block-registry.js";
import { CODE_LANGUAGES } from "./languages.js";

/**
 * A combobox, not a select, so a stored alias or unknown language is kept and
 * normalized at render rather than dropped.
 */
const LANGUAGE_OPTIONS = CODE_LANGUAGES.map((lang) => ({
  label: lang.label,
  value: lang.id,
}));

export const codeBlock = defineBlock({
  name: "core/code",
  title: { id: "block.core.code.title", message: "Code" },
  icon: "Code",
  category: "text",
  // The code box is the block, so styles land on the `<pre>`, not a wrapper.
  selfSeam: true,
  // A theme restyles every code block by defining the vars; token colours ride
  // the highlight theme instead.
  defaultStyles: {
    large: {
      marginTop: "var(--plumix-code-margin-y, 1.5rem)",
      marginBottom: "var(--plumix-code-margin-y, 1.5rem)",
      padding: "var(--plumix-code-padding, 1rem)",
      background: "var(--plumix-code-bg, #f6f8fa)",
      borderRadius: "var(--plumix-code-radius, 6px)",
      overflowX: "auto",
      fontFamily:
        "var(--plumix-code-font, ui-monospace, SFMono-Regular, Menlo, monospace)",
      fontSize: "var(--plumix-code-font-size, 0.875rem)",
      lineHeight: "var(--plumix-code-line-height, 1.6)",
    },
  },
  inputs: [
    {
      name: "text",
      type: "textarea",
      content: true,
      label: { id: "block.core.code.input.text.label", message: "Code" },
    },
    {
      name: "language",
      type: "combobox",
      label: {
        id: "block.core.code.input.language.label",
        message: "Language",
      },
      // Language display names are proper nouns (JavaScript, Python) — not
      // localized.
      options: LANGUAGE_OPTIONS,
    },
  ],
  text: [{ name: "text", prose: false }],
  defaults: { text: "// Your code here", language: "" },
  view: () => import("./code.view.js"),
});
