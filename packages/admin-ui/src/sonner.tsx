import type { CSSProperties } from "react";
import type { ToasterProps } from "sonner";
import { Toaster as Sonner } from "sonner";

// Styled Sonner toaster. Theme-agnostic: the host passes `theme` (this package
// has no theme provider of its own), and the CSS variables map the toast
// surface onto the active shadcn palette.
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
