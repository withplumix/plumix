// The image-role vocabulary a resolved entity carries its images in, apart from
// the plugin registry that declares the roles and the projection that fills
// them. See ADR 0004.

/**
 * The image roles a field may carry, keyed by name. Core declares `featured`
 * and `ogImage`; a plugin or theme that registers another with
 * `registerImageRole` augments this interface so `.role()` accepts the name:
 *
 * ```ts
 * declare module "plumix" {
 *   interface ImageRoles { hero: true }
 * }
 * ```
 */
export interface ImageRoles {
  featured: true;
  ogImage: true;
}

export type ImageRoleName = keyof ImageRoles;

/**
 * An image read off a hydrated reference by the adapter that produced it.
 * `width`/`height` travel as a pair or not at all: one axis alone tells a
 * layout nothing it can use.
 */
export type ResolvedImage = {
  readonly url: string;
  readonly alt: string | null;
} & (
  | { readonly width: number; readonly height: number }
  | { readonly width?: never; readonly height?: never }
);

/**
 * Every image role an entity carries, keyed by role name. A role is present
 * when the entity's scope declares a field in it, and `null` when no field in
 * it resolved to an image — an orphaned reference, or one the adapter refuses.
 */
export type RoleImages = Readonly<
  Partial<Record<ImageRoleName, ResolvedImage | null>>
>;
