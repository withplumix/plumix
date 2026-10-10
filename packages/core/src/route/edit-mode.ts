// The visual-editor edit gate, kept apart from the `ctx` wiring in resolve.ts
// so its security truth table stays auditable.

// Shared vocabulary with the runtime's `useIsEditing`/`useIsPreview`.
type EditRenderMode = "live" | "preview" | "edit";

export interface EditModeDecision {
  readonly mode: EditRenderMode;
  /** Ship + boot the editor runtime into the SSR output. */
  readonly injectRuntime: boolean;
  /**
   * Never edge-cache. The cache layer already excludes these requests via
   * session cookie or `?preview`; this states the gate's intent.
   */
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
