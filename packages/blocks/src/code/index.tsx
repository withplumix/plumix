import type { ReactNode } from "react";

import { defineBlock } from "../block-registry.js";
import { CODE_LANGUAGES, normalizeLanguage } from "./languages.js";

// Suggestions for the language combobox — the curated common-language
// list. A combobox (free text + datalist), not a select: the stored
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
  defaults: { text: "", language: "" },
  render: ({ attrs }): ReactNode => {
    const { text = "", language = "" } = attrs as {
      readonly text?: string;
      readonly language?: string;
    };
    const lang = normalizeLanguage(language);
    return (
      <pre data-language={lang}>
        {lang ? <code data-language={lang}>{text}</code> : text}
      </pre>
    );
  },
});
