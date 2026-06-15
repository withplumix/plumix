import type { ImgHTMLAttributes, ReactNode } from "react";
import { preload } from "react-dom";

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
  /** Mark the LCP image: eager + high fetch-priority + a preload hint. */
  readonly priority?: boolean;
};

export function Image(props: ImageProps): ReactNode {
  const { imageResolver, imageRemotePatterns } = useImageConfig();
  // `densities`/`quality`/`format`/`priority` are component inputs, not DOM
  // attributes — pull them out so they don't leak onto the <img>.
  // `loading`/`decoding`/`fetchPriority` are pulled out too so `...rest` can't
  // clobber the priority-aware defaults applied below (a caller value still
  // wins via the `??`).
  const {
    src,
    alt,
    width,
    height,
    sizes,
    densities,
    quality,
    format,
    priority,
    loading,
    decoding,
    fetchPriority,
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
  // React 19's imperative preload hoists a single, deduped
  // `<link rel="preload" as="image">` into <head> for the LCP image — a JSX
  // <link rel=preload> double-emits under React's resource hoisting.
  if (priority) {
    preload(attrs.src, {
      as: "image",
      imageSrcSet: attrs.srcSet,
      imageSizes: attrs.sizes,
      fetchPriority: "high",
    });
  }
  return (
    <img
      {...rest}
      src={attrs.src}
      srcSet={attrs.srcSet}
      sizes={attrs.sizes}
      width={attrs.width}
      height={attrs.height}
      alt={alt}
      loading={loading ?? (priority ? "eager" : "lazy")}
      decoding={decoding ?? (priority ? "sync" : "async")}
      fetchPriority={fetchPriority ?? (priority ? "high" : undefined)}
    />
  );
}
