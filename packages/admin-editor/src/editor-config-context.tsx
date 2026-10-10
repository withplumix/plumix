import type { ReactElement, ReactNode } from "react";
import { createContext, useContext, useMemo } from "react";

import type { BlockRegistry, ThemeTokens } from "@plumix/core/blocks";

import type { ResolvePluginFieldType } from "./block-input-control.js";
import { EditorError } from "./errors.js";

/** Session-stable for the editor's lifetime. */
export interface EditorConfig {
  /**
   * Core + plugin block registry — inspector schemas, catalog, layer labels.
   */
  readonly registry: BlockRegistry;
  /** Theme tokens offered in the Styles tab's token-or-custom controls. */
  readonly tokens: ThemeTokens;
  /** Viewer capabilities, gating which blocks the catalog offers. */
  readonly capabilities: ReadonlySet<string>;
  /** Absent in a deployment with no plugin field registry. */
  readonly resolvePluginFieldType?: ResolvePluginFieldType;
}

const EditorConfigContext = createContext<EditorConfig | null>(null);

/** Makes the {@link EditorConfig} available to every panel below. Mounted once
 *  at the editor shell. */
export function EditorConfigProvider({
  registry,
  tokens,
  capabilities,
  resolvePluginFieldType,
  children,
}: EditorConfig & { readonly children: ReactNode }): ReactElement {
  const config = useMemo<EditorConfig>(
    () => ({ registry, tokens, capabilities, resolvePluginFieldType }),
    [registry, tokens, capabilities, resolvePluginFieldType],
  );
  return (
    <EditorConfigContext.Provider value={config}>
      {children}
    </EditorConfigContext.Provider>
  );
}

/** The session-stable editor config. Throws outside an
 *  {@link EditorConfigProvider}. */
export function useEditorConfig(): EditorConfig {
  const config = useContext(EditorConfigContext);
  if (!config) throw EditorError.missingConfigProvider();
  return config;
}
