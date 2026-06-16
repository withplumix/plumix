import * as React from "react";
import type { ReactNode } from "react";
import type { ResolvedEntry } from "plumix";
import { Image } from "@plumix/blocks/renderer";

// Read from `entry.meta` because there's no admin affordance to set a
// featured image yet (a later slice adds it).
interface FeaturedImageMeta {
  readonly src?: string;
  readonly alt?: string;
  readonly width?: number;
  readonly height?: number;
}

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
  const image = entry.meta?.featuredImage as FeaturedImageMeta | undefined;
  const content =
    image?.src && image.width && image.height ? (
      <Image
        src={image.src}
        alt={image.alt ?? ""}
        width={image.width}
        height={image.height}
        priority={priority}
      />
    ) : placeholder ? (
      <div
        className="aspect-[3/2] w-full rounded bg-line"
        data-testid="featured-placeholder"
      />
    ) : null;
  if (!content) return null;
  return <div className={className}>{content}</div>;
}
