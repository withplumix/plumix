// The image-role vocabulary a resolved entity carries its images in, apart from
// the plugin registry that declares the roles and the projection that fills
// them. See ADR 0004.

/** Augment it alongside `registerImageRole` so `.role()` accepts the name. */
export interface ImageRoles {
  featured: true;
  ogImage: true;
}

export type ImageRoleName = keyof ImageRoles;

/** `width`/`height` travel as a pair or not at all. */
export type ResolvedImage = {
  readonly url: string;
  readonly alt: string | null;
} & (
  | { readonly width: number; readonly height: number }
  | { readonly width?: never; readonly height?: never }
);

/**
 * Present when the scope declares a field in the role; `null` when none
 * resolved to an image.
 */
export type RoleImages = Readonly<
  Partial<Record<ImageRoleName, ResolvedImage | null>>
>;
