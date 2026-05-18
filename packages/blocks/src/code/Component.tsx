import type { ReactElement } from "react";

import type { BlockProps } from "../types.js";

export function CodeComponent({ attrs, children }: BlockProps): ReactElement {
  const language =
    typeof attrs.language === "string" && attrs.language.length > 0
      ? attrs.language
      : null;
  return (
    <pre
      data-plumix-block="core/code"
      className="plumix-code"
      data-language={language ?? undefined}
    >
      {language === null ? (
        children
      ) : (
        <code data-language={language}>{children}</code>
      )}
    </pre>
  );
}
