import type { ReactNode } from "react";

import { defineBlock } from "../block-registry.js";
import { CODE_THEME_CSS, highlightCode } from "./highlight.js";
import { CODE_LANGUAGES, normalizeLanguage } from "./languages.js";

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
  render: ({ attrs, blockProps }): ReactNode => {
    const { text = "", language = "" } = attrs as {
      readonly text?: string;
      readonly language?: string;
    };
    const lang = normalizeLanguage(language);
    if (lang === undefined) return <pre {...blockProps}>{text}</pre>;

    // An unsupported language keeps the semantic attribute but stays plain.
    const highlighted = highlightCode(text, lang);
    if (highlighted === null) {
      return (
        <pre {...blockProps} data-language={lang}>
          <code data-language={lang}>{text}</code>
        </pre>
      );
    }
    return (
      <>
        {/* href + precedence lets React 19 hoist and dedupe the theme, so N
            code blocks emit one stylesheet, not N inline copies. */}
        <style href="plumix-code-theme" precedence="default">
          {CODE_THEME_CSS}
        </style>
        <pre {...blockProps} data-language={lang}>
          <code
            className="hljs"
            data-language={lang}
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        </pre>
      </>
    );
  },
});
