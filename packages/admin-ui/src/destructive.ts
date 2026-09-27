// House style for destructive actions:
//   - A standalone/primary destructive button (a delete button, a confirm
//     dialog's action) uses `<Button variant="destructive">`.
//   - A destructive action sitting *inline among non-destructive peers*
//     (a ghost action toolbar, a link-remove beside a URL field) uses
//     `variant="ghost"` plus `destructiveGhostClassName`.
//   - A destructive action repeated once per row (a list item's remove, a
//     row's Trash link) uses `destructiveRowClassName`: muted until hovered,
//     because a red control on every row is noise.
// Never a hand-rolled string — `plumix/no-hand-rolled-destructive-tint`
// rejects one — so the surfaces can't drift on what "destructive" looks like.
//
// `hover:text-destructive` is explicit because the ghost variant otherwise
// recolours its text on hover, which would wash out the destructive cue.
export const destructiveGhostClassName =
  "text-destructive hover:text-destructive";

export const destructiveRowClassName =
  "text-muted-foreground hover:text-destructive";
