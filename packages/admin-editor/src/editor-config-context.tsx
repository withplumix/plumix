import type { ReactElement, ReactNode } from "react";
import { createContext, useContext, useMemo } from "react";

import type {
  BlockRegistry,
  StylePolicy,
  ThemeTokens,
} from "@plumix/core/blocks";

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
  /**
   * The blocks the theme allows, from the manifest; absent allows every block.
   * The inserter offers only these, and a block outside it can't be copied.
   */
  readonly allowedBlocks?: ReadonlySet<string>;
  /**
   * The theme's style policy, from the manifest; absent allows custom values
   * everywhere. Every style control asks it through the Styles tab.
   */
  readonly stylePolicy?: StylePolicy;
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
  allowedBlocks,
  stylePolicy,
  resolvePluginFieldType,
  children,
}: EditorConfig & { readonly children: ReactNode }): ReactElement {
  const config = useMemo<EditorConfig>(
    () => ({
      registry,
      tokens,
      capabilities,
      allowedBlocks,
      stylePolicy,
      resolvePluginFieldType,
    }),
    [
      registry,
      tokens,
      capabilities,
      allowedBlocks,
      stylePolicy,
      resolvePluginFieldType,
    ],
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
