import type { ReactNode } from "react";

import { defineBlock } from "../block-registry.js";

export const codeBlockV2 = defineBlock({
  name: "core/code",
  title: "Code",
  icon: "Code",
  category: "text",
  inputs: [
    { name: "text", type: "textarea", label: "Code" },
    { name: "language", type: "text", label: "Language" },
  ],
  defaults: { text: "", language: "" },
  render: ({ attrs }): ReactNode => {
    const { text = "", language = "" } = attrs as {
      readonly text?: string;
      readonly language?: string;
    };
    const lang = language.trim() || undefined;
    return (
      <pre data-language={lang}>
        {lang ? <code data-language={lang}>{text}</code> : text}
      </pre>
    );
  },
});
