import type { ResolvedEntry } from "plumix/theme";
import type { ReactNode } from "react";

import { Image } from "@plumix/blocks/renderer";

interface FeaturedImageProps {
  readonly entry: ResolvedEntry;
  readonly priority?: boolean;
  // Cards fall back to a neutral block when there's no image; the single
  // post renders nothing.
  readonly placeholder?: boolean;
  readonly className?: string;
}

export function FeaturedImage({
  entry,
  priority,
  placeholder,
  className,
}: FeaturedImageProps): ReactNode {
  const image = entry.images.featured;
  // `<Image>` lays out from intrinsic dimensions, and a role image carries
  // them as a pair or not at all — so one axis narrows both.
  if (image?.width !== undefined) {
    return (
      <div className={className}>
        <Image
          src={image.url}
          alt={image.alt ?? ""}
          width={image.width}
          height={image.height}
          priority={priority}
          data-testid="featured-image"
        />
      </div>
    );
  }
  if (!placeholder) return null;
  return (
    <div className={className}>
      <div
        className="bg-line aspect-[3/2] w-full rounded"
        data-testid="featured-placeholder"
      />
    </div>
  );
}
