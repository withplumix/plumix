// The visual-editor edit gate: the security truth table deciding whether a
// request renders live/preview/edit and whether to ship the editor runtime.
// Kept separate from the `ctx` wiring in resolve.ts so it stays auditable.

/** Render mode, shared vocabulary with the runtime's `useIsEditing`/`useIsPreview`. */
export type EditRenderMode = "live" | "preview" | "edit";

export interface EditModeDecision {
  readonly mode: EditRenderMode;
  /** Ship + boot the editor runtime into the SSR output. */
  readonly injectRuntime: boolean;
  // The response must never be edge-cached. Today the cache layer already
  // excludes these requests (a session cookie / `?preview` marks them
  // privileged); this records the gate's intent as the eventual single
  // source of truth.
  readonly bypassCache: boolean;
}

/** The decision for an ordinary visitor render — the common case. */
export const LIVE_EDIT_MODE: EditModeDecision = {
  mode: "live",
  injectRuntime: false,
  bypassCache: false,
};

export function resolveEditMode(input: {
  /** `?plumix.edit` present on the request URL. */
  readonly editParam: boolean;
  /** Viewer can edit this entry (false when there is no session). */
  readonly canEdit: boolean;
  /** A valid `?preview=<token>` grants draft visibility for this entry. */
  readonly previewGrant: boolean;
}): EditModeDecision {
  // The runtime boots only for an authorized editor who asked for it. A
  // leaked `?plumix.edit` without the capability falls through to the
  // normal preview/live path below — never edit.
  if (input.editParam && input.canEdit) {
    return { mode: "edit", injectRuntime: true, bypassCache: true };
  }
  if (input.previewGrant) {
    return { mode: "preview", injectRuntime: false, bypassCache: true };
  }
  return { mode: "live", injectRuntime: false, bypassCache: false };
}
