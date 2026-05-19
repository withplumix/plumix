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
    const trimmed = language.trim();
    return (
      <pre data-language={trimmed.length > 0 ? trimmed : undefined}>
        {trimmed.length > 0 ? (
          <code data-language={trimmed}>{text}</code>
        ) : (
          text
        )}
      </pre>
    );
  },
});
