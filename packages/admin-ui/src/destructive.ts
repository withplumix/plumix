// House style for destructive actions:
//   - A standalone/primary destructive button (a delete button, a confirm
//     dialog's action) uses `<Button variant="destructive">`.
//   - A destructive action sitting *inline among non-destructive peers*
//     (a ghost action toolbar, a per-row "Remove") uses `variant="ghost"`
//     plus this shared tint — never a hand-rolled `text-destructive` string,
//     so the surfaces can't drift on what "destructive" looks like.
//
// `hover:text-destructive` is explicit because the ghost variant otherwise
// recolours its text on hover, which would wash out the destructive cue.
export const destructiveGhostClassName =
  "text-destructive hover:text-destructive";
