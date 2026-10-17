/**
 * Closed, so the admin compiles against it. A registrable role reaches the
 * admin through its runtime manifest, never a copy (WordPress Trac #55895).
 */
export const USER_ROLES = [
  "subscriber",
  "contributor",
  "author",
  "editor",
  "admin",
] as const;

export type UserRole = (typeof USER_ROLES)[number];
