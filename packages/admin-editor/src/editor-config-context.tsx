import type { ReactElement, ReactNode } from "react";
import { createContext, useContext, useMemo } from "react";

import type {
  BlockRegistry,
  StylePolicy,
  ThemeTokens,
} from "@plumix/core/blocks";

import type { ResolvePluginFieldType } from "./block-input-control.js";
import type { LayoutGate } from "./layout-gate.js";
import { EditorError } from "./errors.js";
import { layoutGate } from "./layout-gate.js";

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
   * everywhere.
   */
  readonly stylePolicy?: StylePolicy;
  /** Absent in a deployment with no plugin field registry. */
  readonly resolvePluginFieldType?: ResolvePluginFieldType;
  /** What the writer may do to layout; absent grants all of it. */
  readonly layout?: LayoutGate;
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
  layout,
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
      layout,
    }),
    [
      registry,
      tokens,
      capabilities,
      allowedBlocks,
      stylePolicy,
      resolvePluginFieldType,
      layout,
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

const FULL_LAYOUT = layoutGate(true);

/** The one gate every layout control asks. */
export function useLayoutGate(): LayoutGate {
  return useEditorConfig().layout ?? FULL_LAYOUT;
}
