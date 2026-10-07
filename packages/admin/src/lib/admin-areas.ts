import type { AdminArea } from "@plumix/core";

import { getRefusedAdminAreas } from "./manifest.js";

/** An admin card, page or action that belongs to an {@link AdminArea}. */
export type AdminAreaSurface =
  | "selfApiTokens"
  | "otherUsersApiTokens"
  | "deviceAuthorizationPage"
  | "passkeysCard"
  | "userInvite"
  | "emailChange"
  | "mailerPage";

/**
 * Every surface each admin area owns. A runtime that refuses an area hides all
 * of them (ADR 0014). Typed over every area, so a new one fails typecheck
 * here until it names its surfaces; an area with none (OAuth linking has no
 * admin surface yet) says so with an empty list.
 */
export const ADMIN_AREA_SURFACES = {
  apiTokens: ["selfApiTokens", "otherUsersApiTokens"],
  deviceAuthorization: ["deviceAuthorizationPage"],
  passkeys: ["passkeysCard"],
  oauthLinking: [],
  emailDelivery: ["userInvite", "emailChange", "mailerPage"],
} as const satisfies Record<AdminArea, readonly AdminAreaSurface[]>;

/** Whether the deployment offers `surface`: false when its area is refused. */
export function isSurfaceOffered(
  surface: AdminAreaSurface,
  refused: readonly AdminArea[] = getRefusedAdminAreas(),
): boolean {
  return !refused.some((area) =>
    (ADMIN_AREA_SURFACES[area] as readonly AdminAreaSurface[]).includes(
      surface,
    ),
  );
}
