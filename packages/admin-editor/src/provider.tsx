import type { ReactElement, ReactNode } from "react";
import { createContext, useContext, useState } from "react";
import { useStore } from "zustand";

import type { BlockNode } from "@plumix/blocks";

import type { EditorDevice, EditorStore, EditorStoreApi } from "./store.js";
import { EditorError } from "./errors.js";
import { createEditorStore } from "./store.js";

const EditorStoreContext = createContext<EditorStoreApi | null>(null);

/**
 * Creates one store per editor instance (kept stable across renders) and
 * shares it via context. Uncontrolled: `initialTree` seeds once — the host
 * persists via callbacks and never feeds the tree back mid-session.
 */
export function EditorProvider({
  initialTree,
  device,
  zoom,
  children,
}: {
  readonly initialTree?: readonly BlockNode[];
  readonly device?: EditorDevice;
  readonly zoom?: number;
  readonly children: ReactNode;
}): ReactElement {
  const [store] = useState<EditorStoreApi>(() =>
    createEditorStore({ tree: initialTree, device, zoom }),
  );

  return (
    <EditorStoreContext.Provider value={store}>
      {children}
    </EditorStoreContext.Provider>
  );
}

export function useEditorStore<T>(selector: (state: EditorStore) => T): T {
  const store = useContext(EditorStoreContext);
  if (!store) throw EditorError.missingProvider();
  return useStore(store, selector);
}
