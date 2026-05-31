import type { ReactElement, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

interface LazyMountProps {
  readonly children: ReactNode;
  readonly placeholderTestId?: string;
  // Reserve space so the placeholder consumes its target dimensions —
  // a zero-height placeholder intersects the viewport on first paint
  // and defeats the lazy mount.
  readonly minHeight?: number;
}

export function LazyMount({
  children,
  placeholderTestId,
  minHeight,
}: LazyMountProps): ReactElement {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (visible) return;
    const target = ref.current;
    if (!target) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [visible]);

  if (visible) return <>{children}</>;

  return (
    <div
      ref={ref}
      data-testid={placeholderTestId}
      style={minHeight === undefined ? undefined : { minHeight }}
    />
  );
}
