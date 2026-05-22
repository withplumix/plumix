// "stale" means the user's pending autosave was anchored against an
// older version of the live row than what's on the server now —
// somebody else published or edited live in between. The editor
// surfaces a three-action dialog (Use mine / Use theirs / Compare)
// at mount when this returns `'stale'` so the author resolves the
// fork before their next save lands on top of a newer live row.
//
// `'none'` short-circuits the dialog flow when the user has nothing
// pending in the first place.
type StaleAutosaveState = "fresh" | "stale" | "none";

export function detectStaleAutosave(
  autosaveUpdatedAt: Date | null,
  liveUpdatedAt: Date,
): StaleAutosaveState {
  if (autosaveUpdatedAt === null) return "none";
  return autosaveUpdatedAt.getTime() < liveUpdatedAt.getTime()
    ? "stale"
    : "fresh";
}
