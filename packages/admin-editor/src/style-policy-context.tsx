import type { ReactElement, ReactNode } from "react";
import { createContext, useContext } from "react";

import type { StylePolicyView } from "./style-policy-view.js";
import { PERMISSIVE_STYLE_POLICY_VIEW } from "./style-policy-view.js";

const StylePolicyContext = createContext<StylePolicyView>(
  PERMISSIVE_STYLE_POLICY_VIEW,
);

export function StylePolicyProvider({
  view,
  children,
}: {
  readonly view: StylePolicyView;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <StylePolicyContext.Provider value={view}>
      {children}
    </StylePolicyContext.Provider>
  );
}

/** The active block's policy view; allows everything outside a provider. */
export function useStylePolicyView(): StylePolicyView {
  return useContext(StylePolicyContext);
}
