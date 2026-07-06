import type { ReactNode } from "react";

import { defineBlock } from "../block-registry.js";
import { CODE_THEME_CSS, highlightCode } from "./highlight.js";
import { CODE_LANGUAGES, normalizeLanguage } from "./languages.js";

// Suggestions for the language combobox — the curated common-language
// list. A combobox (free text + suggestions), not a select: the stored
// value stays a plain string, so content authored with the old
// free-text field (alias or unknown language) is preserved and
// normalized at render rather than dropped.
const LANGUAGE_OPTIONS = CODE_LANGUAGES.map((lang) => ({
  label: lang.label,
  value: lang.id,
}));

export const codeBlock = defineBlock({
  name: "core/code",
  title: "Code",
  icon: "Code",
  category: "text",
  // selfSeam so the block class + default styles land on the `<pre>` itself,
  // not a wrapper div — the code box is the block.
  selfSeam: true,
  // Neutral, theme-overridable defaults seeded as editable Styles values: a
  // padded, rounded, horizontally-scrolling monospace box. A theme restyles
  // every code block by defining the vars. (Token colours are separate — they
  // ride the highlight theme.)
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
    { name: "text", type: "textarea", label: "Code" },
    {
      name: "language",
      type: "combobox",
      label: "Language",
      options: LANGUAGE_OPTIONS,
    },
  ],
  defaults: { text: "// Your code here", language: "" },
  render: ({ attrs, blockProps }): ReactNode => {
    const { text = "", language = "" } = attrs as {
      readonly text?: string;
      readonly language?: string;
    };
    const lang = normalizeLanguage(language);
    if (lang === undefined) return <pre {...blockProps}>{text}</pre>;

    // highlight.js runs here — sync, so this same render highlights at SSR
    // (public) and re-runs live in the editor canvas when the language changes.
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
