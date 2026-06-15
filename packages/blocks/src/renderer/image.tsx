import type { ImgHTMLAttributes, ReactNode } from "react";

import { buildImageAttrs } from "./image-attrs.js";
import { useImageConfig } from "./index.js";

type ImgAttrs = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src" | "srcSet" | "width" | "height" | "sizes" | "alt"
>;

export type ImageProps = ImgAttrs & {
  readonly src: string;
  /** Required; `""` for a decorative image. */
  readonly alt: string;
  readonly width: number;
  readonly height: number;
  readonly sizes?: string;
  readonly densities?: readonly number[];
  readonly quality?: number;
  readonly format?: string;
};

export function Image(props: ImageProps): ReactNode {
  const { imageResolver, imageRemotePatterns } = useImageConfig();
  // `densities`/`quality`/`format` are builder inputs, not DOM attributes —
  // destructure them out so they don't leak onto the <img>.
  const {
    src,
    alt,
    width,
    height,
    sizes,
    densities,
    quality,
    format,
    ...rest
  } = props;
  const attrs = buildImageAttrs({
    src,
    width,
    height,
    sizes,
    densities,
    quality,
    format,
    resolver: imageResolver,
    remotePatterns: imageRemotePatterns,
  });
  return (
    <img
      loading="lazy"
      decoding="async"
      {...rest}
      src={attrs.src}
      srcSet={attrs.srcSet}
      sizes={attrs.sizes}
      width={attrs.width}
      height={attrs.height}
      alt={alt}
    />
  );
}
