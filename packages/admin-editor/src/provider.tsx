import type { MutableRefObject, ReactElement, ReactNode } from "react";
import { createContext, useContext, useRef, useState } from "react";
import { useStore } from "zustand";

import type { BlockNode, ThemeBreakpoints } from "@plumix/blocks";
import type { SerializedLoaderData } from "@plumix/blocks/renderer";

import type { EditorDevice, EditorStore, EditorStoreApi } from "./store.js";
import { EditorError } from "./errors.js";
import { createEditorStore } from "./store.js";

const EditorStoreContext = createContext<EditorStoreApi | null>(null);

/** Pushes a scoped refresh's loader data to the canvas. Held in a ref so the
 *  CanvasFrame (which owns the bridge) can populate it once connected, and the
 *  inspector's refresh control can read it without re-rendering on connect. */
type LoaderDataPush = (data: SerializedLoaderData) => void;

const LoaderPushContext =
  createContext<MutableRefObject<LoaderDataPush | null> | null>(null);

/**
 * Creates one store per editor instance (kept stable across renders) and
 * shares it via context. Uncontrolled: `initialTree` seeds once — the host
 * persists via callbacks and never feeds the tree back mid-session.
 */
export function EditorProvider({
  initialTree,
  device,
  zoom,
  breakpoints,
  children,
}: {
  readonly initialTree?: readonly BlockNode[];
  readonly device?: EditorDevice;
  readonly zoom?: number;
  readonly breakpoints?: ThemeBreakpoints;
  readonly children: ReactNode;
}): ReactElement {
  const [store] = useState<EditorStoreApi>(() =>
    createEditorStore({ tree: initialTree, device, zoom, breakpoints }),
  );
  const loaderPushRef = useRef<LoaderDataPush | null>(null);

  return (
    <EditorStoreContext.Provider value={store}>
      <LoaderPushContext.Provider value={loaderPushRef}>
        {children}
      </LoaderPushContext.Provider>
    </EditorStoreContext.Provider>
  );
}

/** The loader-data push channel ref. CanvasFrame sets `.current` when its
 *  bridge connects; the inspector's refresh control calls it. Null outside an
 *  EditorProvider (e.g. an isolated unit render) — callers no-op then. */
export function useLoaderPushRef(): MutableRefObject<LoaderDataPush | null> | null {
  return useContext(LoaderPushContext);
}

export function useEditorStore<T>(selector: (state: EditorStore) => T): T {
  const store = useContext(EditorStoreContext);
  if (!store) throw EditorError.missingProvider();
  return useStore(store, selector);
}

/** The raw store handle, for non-React consumers like the canvas bridge. */
export function useEditorStoreApi(): EditorStoreApi {
  const store = useContext(EditorStoreContext);
  if (!store) throw EditorError.missingProvider();
  return store;
}
