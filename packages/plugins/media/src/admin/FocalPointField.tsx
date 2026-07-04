import type { ReactNode, PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useRef } from "react";
import { useLingui } from "plumix/i18n";

// Reuses the media picker's "no media selected" string — the focal control is
// inert until an image is chosen — rather than adding a near-duplicate.
import { M } from "./messages.js";

// The focal point is a normalized crop anchor { x, y } in [0, 1], applied by the
// image block as CSS object-position. This control lets an author set it by
// clicking/dragging on the image preview instead of typing coordinates.

interface FocalPoint {
  readonly x: number;
  readonly y: number;
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

function readFocalPoint(raw: unknown): FocalPoint {
  if (raw && typeof raw === "object") {
    const o = raw as { x?: unknown; y?: unknown };
    return {
      x: typeof o.x === "number" ? clamp01(o.x) : 0.5,
      y: typeof o.y === "number" ? clamp01(o.y) : 0.5,
    };
  }
  return { x: 0.5, y: 0.5 };
}

// The block's image url — the picked media's url, else the raw src escape hatch.
function imageUrl(attrs: Readonly<Record<string, unknown>>): string {
  const media = attrs.media;
  if (media && typeof media === "object") {
    const url = (media as { url?: unknown }).url;
    if (typeof url === "string" && url !== "") return url;
  }
  return typeof attrs.src === "string" ? attrs.src : "";
}

/** Pointer position → normalized focal point within the preview's bounds. */
export function focalFromPointer(
  rect: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  },
  clientX: number,
  clientY: number,
): FocalPoint {
  if (rect.width === 0 || rect.height === 0) return { x: 0.5, y: 0.5 };
  return {
    x: clamp01((clientX - rect.left) / rect.width),
    y: clamp01((clientY - rect.top) / rect.height),
  };
}

export function FocalPointField({
  rhf,
  testId,
  attrs,
}: {
  readonly rhf: {
    readonly value: unknown;
    readonly onChange: (next: unknown) => void;
  };
  readonly testId: string;
  readonly attrs?: Readonly<Record<string, unknown>>;
}): ReactNode {
  const { i18n } = useLingui();
  const url = imageUrl(attrs ?? {});
  const focal = readFocalPoint(rhf.value);
  const frameRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const setFromPointer = useCallback(
    (clientX: number, clientY: number): void => {
      const el = frameRef.current;
      if (!el) return;
      rhf.onChange(
        focalFromPointer(el.getBoundingClientRect(), clientX, clientY),
      );
    },
    [rhf],
  );

  if (url === "") {
    return (
      <p
        className="text-muted-foreground text-sm"
        data-testid={`${testId}-empty`}
      >
        {i18n._(M.empty)}
      </p>
    );
  }

  return (
    <div
      ref={frameRef}
      data-testid={testId}
      className="relative inline-block cursor-crosshair overflow-hidden rounded-md border select-none"
      onPointerDown={(e: ReactPointerEvent<HTMLDivElement>) => {
        draggingRef.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        setFromPointer(e.clientX, e.clientY);
      }}
      onPointerMove={(e: ReactPointerEvent<HTMLDivElement>) => {
        if (draggingRef.current) setFromPointer(e.clientX, e.clientY);
      }}
      onPointerUp={() => {
        draggingRef.current = false;
      }}
      // A cancelled gesture (capture stolen, touch interrupted) never fires
      // pointerup — reset here so a later move can't keep writing focal points.
      onPointerCancel={() => {
        draggingRef.current = false;
      }}
    >
      {/* Decorative preview; the frame owns pointer + a11y. */}
      <img
        src={url}
        alt=""
        className="pointer-events-none block max-h-48 w-auto max-w-full"
      />
      <span
        data-testid={`${testId}-dot`}
        className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-black/40 shadow ring-1 ring-black/40"
        style={{
          left: `${String(focal.x * 100)}%`,
          top: `${String(focal.y * 100)}%`,
        }}
      />
    </div>
  );
}
