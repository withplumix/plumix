import { cn } from "./destructive-tint.cn.js";

export const ghost = (
  <button className="text-destructive hover:text-destructive">x</button>
);
export const row = (
  <button className="text-muted-foreground hover:text-destructive">x</button>
);
export const composed = (
  <button
    className={cn("text-destructive hover:text-destructive size-8", "shrink-0")}
  >
    x
  </button>
);
export const templated = (size: string) => (
  <button className={`text-muted-foreground hover:text-destructive ${size}`}>
    x
  </button>
);
