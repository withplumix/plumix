import type { ReactElement, ReactNode } from "react";
import { createContext, useContext, useMemo } from "react";

import type { StyleFields, ThemeTokens } from "@plumix/core/blocks";
import { createStyleFields } from "@plumix/core/blocks";

import { EditorError } from "./errors.js";

const StyleFieldsContext = createContext<StyleFields | null>(null);

export function StyleFieldsProvider({
  tokens,
  children,
}: {
  readonly tokens: ThemeTokens;
  readonly children: ReactNode;
}): ReactElement {
  const fields = useMemo(() => createStyleFields(tokens), [tokens]);
  return (
    <StyleFieldsContext.Provider value={fields}>
      {children}
    </StyleFieldsContext.Provider>
  );
}

/** The theme-scoped {@link StyleFields} builder. Throws outside a provider. */
export function useStyleFields(): StyleFields {
  const fields = useContext(StyleFieldsContext);
  if (!fields) throw EditorError.missingStyleFieldsProvider();
  return fields;
}
