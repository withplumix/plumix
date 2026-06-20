import type { ReactElement } from "react";
import { useEffect, useRef } from "react";

import type { BlockRegistry, EntryContent } from "@plumix/blocks";
import { defineEntryContent } from "@plumix/blocks";

import { BlockCatalog } from "./block-catalog-tab.js";
import { BlockInspector } from "./block-inspector.js";
import { CanvasFrame } from "./canvas-frame.js";
import { EditorProvider, useEditorStoreApi } from "./provider.js";

const NO_CAPABILITIES: ReadonlySet<string> = new Set();

interface PlumixEditorProps {
  /** Seed content; the editor owns state thereafter (uncontrolled). */
  readonly defaultValue?: EntryContent;
  /** URL the canvas iframe loads — the entry's real route with `?plumix.edit`. */
  readonly previewUrl: string;
  /** Origin of that route, for bridge message pinning. */
  readonly origin: string;
  /** Core + plugin block registry, supplying the inspector + catalog schemas. */
  readonly registry: BlockRegistry;
  /** Viewer capabilities, gating which blocks the catalog offers. */
  readonly capabilities?: ReadonlySet<string>;
  /** Fires with the full content envelope whenever the tree changes. The host
   *  debounces + persists (orpc lives in the app, never in this package). */
  readonly onChange?: (content: EntryContent) => void;
}

/**
 * The bespoke editor's host shell: the canvas iframe plus the right-rail
 * attribute inspector. Owns the editor store; persistence is the host app's
 * job, wired via `onChange`.
 */
export function PlumixEditor({
  defaultValue,
  previewUrl,
  origin,
  registry,
  capabilities = NO_CAPABILITIES,
  onChange,
}: PlumixEditorProps): ReactElement {
  return (
    <EditorProvider initialTree={defaultValue?.blocks}>
      <div className="flex h-full" data-testid="plumix-editor-layout">
        <aside
          className="bg-background w-72 shrink-0 overflow-auto border-e"
          data-testid="plumix-editor-left"
        >
          <BlockCatalog registry={registry} capabilities={capabilities} />
        </aside>
        <CanvasFrame
          previewUrl={previewUrl}
          origin={origin}
          registry={registry}
          capabilities={capabilities}
        />
        <aside
          className="bg-background w-80 shrink-0 overflow-auto border-s"
          data-testid="plumix-editor-right"
        >
          <BlockInspector registry={registry} />
        </aside>
      </div>
      {onChange ? <TreeChangeEmitter onChange={onChange} /> : null}
    </EditorProvider>
  );
}

/**
 * Subscribes to canonical-tree changes and emits the content envelope. Kept a
 * child of EditorProvider so it can reach the store; the latest `onChange` is
 * held in a ref so re-subscribing isn't needed when the callback identity
 * changes between renders.
 */
export function TreeChangeEmitter({
  onChange,
}: {
  readonly onChange: (content: EntryContent) => void;
}): null {
  const store = useEditorStoreApi();
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(
    () =>
      store.subscribe((state, prev) => {
        if (state.tree !== prev.tree) {
          onChangeRef.current(defineEntryContent(state.tree));
        }
      }),
    [store],
  );
  return null;
}
