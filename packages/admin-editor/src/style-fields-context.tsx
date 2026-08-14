import type { ReactElement, ReactNode } from "react";
import { createContext, useContext, useMemo } from "react";

import type { StyleFields, ThemeTokens } from "@plumix/blocks";
import { createStyleFields } from "@plumix/blocks";

import { EditorError } from "./errors.js";

const StyleFieldsContext = createContext<StyleFields | null>(null);

/**
 * Binds the active theme's tokens once and shares the resulting
 * {@link StyleFields} builder with every style control below, so a control asks
 * for a property's field instead of receiving `tokens` drilled through the tab.
 */
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
