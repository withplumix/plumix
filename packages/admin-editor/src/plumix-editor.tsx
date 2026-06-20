import type { ReactElement } from "react";

import type { EntryContent } from "@plumix/blocks";

import { CanvasFrame } from "./canvas-frame.js";
import { EditorProvider } from "./provider.js";

interface PlumixEditorProps {
  /** Seed content; the editor owns state thereafter (uncontrolled). */
  readonly defaultValue?: EntryContent;
  /** URL the canvas iframe loads — the entry's real route with `?plumix.edit`. */
  readonly previewUrl: string;
  /** Origin of that route, for bridge message pinning. */
  readonly origin: string;
}

/**
 * The bespoke editor's host shell. Owns the editor store and the canvas;
 * persistence is the host app's job, wired via callbacks in later slices.
 */
export function PlumixEditor({
  defaultValue,
  previewUrl,
  origin,
}: PlumixEditorProps): ReactElement {
  return (
    <EditorProvider initialTree={defaultValue?.blocks}>
      <CanvasFrame previewUrl={previewUrl} origin={origin} />
    </EditorProvider>
  );
}
