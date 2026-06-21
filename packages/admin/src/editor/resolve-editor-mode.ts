type EditorMode = "create" | "edit-live" | "edit-with-draft";

interface SupportsInput {
  readonly supports?: readonly string[];
}

// Whether the type opts into the visual canvas. Missing manifest entry →
// default true (legacy types predate the `supports` list).
export function supportsEditor(entryType: SupportsInput | undefined): boolean {
  return entryType?.supports ? entryType.supports.includes("editor") : true;
}

export function supportsRevisions(
  entryType: SupportsInput | undefined,
): boolean {
  return entryType?.supports?.includes("revisions") ?? false;
}

interface ResolveEditorModeInput {
  // The entry type from the manifest, or `undefined` if the slug
  // doesn't resolve (stale URL / manifest race). Missing → safe
  // default `edit-live`.
  readonly entryType:
    | {
        readonly name: string;
        readonly capabilityType?: string;
        readonly supports?: readonly string[];
      }
    | undefined;
  // Current `entries.status` value. `published` or `scheduled` route
  // through draft mode (when the type opts in); everything else goes
  // straight to live.
  readonly currentStatus: string;
  // Whether the calling user authored the entry. Matters for the
  // edit_own gate — authors of their own post still get the draft
  // flow, even without edit_any.
  readonly isAuthor: boolean;
  readonly capabilities: ReadonlySet<string>;
}

// Maps (entry, viewer) → which editor experience to mount. Mirrors the
// server's `entry.update` saveAs defaulting (a published row of an
// autosave-supporting type whose viewer can edit gets draft routing);
// the dispatcher logic lives here so unit tests can run the truth
// table without booting the editor.
export function resolveEditorMode({
  entryType,
  currentStatus,
  isAuthor,
  capabilities,
}: ResolveEditorModeInput): EditorMode {
  if (!entryType) return "edit-live";
  const supportsAutosave = entryType.supports?.includes("autosave") ?? false;
  if (!supportsAutosave) return "edit-live";

  const isLiveStatus =
    currentStatus === "published" || currentStatus === "scheduled";
  if (!isLiveStatus) return "edit-live";

  // Capability namespace matches the server: by default it's the entry
  // type name, but plugins may share a `capabilityType` to pool
  // permissions across types (two plugins both `capabilityType: "post"`
  // share `entry:post:*`).
  const capType = entryType.capabilityType ?? entryType.name;
  const canEditAny = capabilities.has(`entry:${capType}:edit_any`);
  const canEditOwn = capabilities.has(`entry:${capType}:edit_own`);
  // Author flag is required for the `edit_own` branch — a viewer who
  // can edit their own posts but isn't the author of THIS row falls
  // through to edit-live.
  if (canEditAny || (isAuthor && canEditOwn)) return "edit-with-draft";
  return "edit-live";
}
