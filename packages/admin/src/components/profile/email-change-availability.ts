/**
 * A change is confirmed by magic link, so without magic-link sign-in the email
 * is read-only. `magicLink` is undefined until the sign-in methods load.
 */
type EmailChangeAvailability = "offer" | "unavailable" | "hidden";

export function emailChangeAvailability({
  canEdit,
  magicLink,
}: {
  readonly canEdit: boolean;
  readonly magicLink: boolean | undefined;
}): EmailChangeAvailability {
  // eslint-disable-next-line lingui/no-unlocalized-strings -- discriminant, not UI copy
  if (!canEdit || magicLink === undefined) return "hidden";
  // eslint-disable-next-line lingui/no-unlocalized-strings -- discriminants, not UI copy
  return magicLink ? "offer" : "unavailable";
}
