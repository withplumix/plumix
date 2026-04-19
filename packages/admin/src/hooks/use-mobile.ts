/* Shadcn-generated hook — ships as part of `shadcn add sidebar`. Kept
 * verbatim so future `shadcn diff` upgrades don't merge-conflict. The
 * setState-in-effect pattern is idiomatic for media-query subscription and
 * functions correctly; we suppress the stricter React Compiler rule only
 * for this one file.
 */
/* eslint-disable react-hooks/set-state-in-effect */
import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
    undefined,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
