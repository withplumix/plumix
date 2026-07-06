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
  render: ({ attrs }): ReactNode => {
    const { text = "", language = "" } = attrs as {
      readonly text?: string;
      readonly language?: string;
    };
    const lang = normalizeLanguage(language);
    if (lang === undefined) return <pre>{text}</pre>;

    // highlight.js runs here — sync, so this same render highlights at SSR
    // (public) and re-runs live in the editor canvas when the language changes.
    // An unsupported language keeps the semantic attribute but stays plain.
    const highlighted = highlightCode(text, lang);
    if (highlighted === null) {
      return (
        <pre data-language={lang}>
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
        <pre data-language={lang}>
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
