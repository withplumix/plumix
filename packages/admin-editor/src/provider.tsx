import type { ReactElement, ReactNode, RefObject } from "react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useStore } from "zustand";

import type { BlockNode, ThemeBreakpoints } from "@plumix/blocks";
import type { SerializedLoaderData } from "@plumix/blocks/renderer";

import type { CameraStore, CameraStoreApi } from "./camera-store.js";
import type { EditorDevice, EditorStore, EditorStoreApi } from "./store.js";
import { createCameraStore } from "./camera-store.js";
import { EditorError } from "./errors.js";
import { createEditorStore } from "./store.js";

const EditorStoreContext = createContext<EditorStoreApi | null>(null);
const CameraStoreContext = createContext<CameraStoreApi | null>(null);

/** Pushes a scoped refresh's loader data to the canvas. Held in a ref so the
 *  CanvasFrame (which owns the bridge) can populate it once connected, and the
 *  inspector's refresh control can read it without re-rendering on connect. */
type LoaderDataPush = (data: SerializedLoaderData) => void;

const LoaderPushContext =
  createContext<RefObject<LoaderDataPush | null> | null>(null);

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
  starterOpen,
  children,
}: {
  readonly initialTree?: readonly BlockNode[];
  readonly device?: EditorDevice;
  readonly zoom?: number;
  readonly breakpoints?: ThemeBreakpoints;
  /** Seeds the starter picker open (once) — the host sets this for a blank
   *  entry that has eligible starters. */
  readonly starterOpen?: boolean;
  readonly children: ReactNode;
}): ReactElement {
  const [store] = useState<EditorStoreApi>(() =>
    createEditorStore({
      tree: initialTree,
      device,
      breakpoints,
      starterOpen,
    }),
  );
  const [camera] = useState<CameraStoreApi>(() => createCameraStore({ zoom }));
  const loaderPushRef = useRef<LoaderDataPush | null>(null);

  // The one document→camera coupling, as a one-way notification: switching
  // device re-enters fit mode so the new frame width re-fits the viewport. The
  // camera stays ignorant of the document; only this edge crosses the seam.
  useEffect(
    () =>
      store.subscribe((state, prev) => {
        if (state.device !== prev.device) camera.getState().enableFit();
      }),
    [store, camera],
  );

  return (
    <EditorStoreContext.Provider value={store}>
      <CameraStoreContext.Provider value={camera}>
        <LoaderPushContext.Provider value={loaderPushRef}>
          {children}
        </LoaderPushContext.Provider>
      </CameraStoreContext.Provider>
    </EditorStoreContext.Provider>
  );
}

/** The loader-data push channel ref. CanvasFrame sets `.current` when its
 *  bridge connects; the inspector's refresh control calls it. Null outside an
 *  EditorProvider (e.g. an isolated unit render) — callers no-op then. */
export function useLoaderPushRef(): RefObject<LoaderDataPush | null> | null {
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

/** Subscribe to the canvas camera (pan/zoom/fit) — the sibling store the
 *  editor provider injects alongside the document store. */
export function useCameraStore<T>(selector: (state: CameraStore) => T): T {
  const camera = useContext(CameraStoreContext);
  if (!camera) throw EditorError.missingProvider();
  return useStore(camera, selector);
}

/** The raw camera handle, for gesture/geometry hooks that read it imperatively. */
export function useCameraStoreApi(): CameraStoreApi {
  const camera = useContext(CameraStoreContext);
  if (!camera) throw EditorError.missingProvider();
  return camera;
}
