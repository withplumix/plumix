import type { ReactNode } from "react";

import type { BlockViewProps } from "../render-block-tree.js";
import { CODE_THEME_CSS, highlightCode } from "./highlight.js";
import { normalizeLanguage } from "./languages.js";

export default function CodeView({
  attrs,
  blockProps,
}: BlockViewProps): ReactNode {
  const { text = "", language = "" } = attrs as {
    readonly text?: string;
    readonly language?: string;
  };
  const lang = normalizeLanguage(language);
  if (lang === undefined) return <pre {...blockProps}>{text}</pre>;

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
          data-testid="code-highlighted"
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      </pre>
    </>
  );
}
