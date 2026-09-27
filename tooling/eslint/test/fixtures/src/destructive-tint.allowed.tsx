// The declaration module's own values sit outside any `className`.
export const destructiveGhostClassName =
  "text-destructive hover:text-destructive";
export const destructiveRowClassName =
  "text-muted-foreground hover:text-destructive";

export const errorText = <p className="text-destructive text-sm">x</p>;
export const menuItem = (
  <div className="text-destructive focus:text-destructive">x</div>
);
export const imported = (
  <button className={destructiveGhostClassName}>x</button>
);
