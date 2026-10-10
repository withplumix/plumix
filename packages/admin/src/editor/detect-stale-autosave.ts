/**
 * "stale": the pending autosave was anchored to an older live row than the
 * server's. "none": nothing pending.
 */
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
