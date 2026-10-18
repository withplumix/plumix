export const DEBUG_MAIL_PATH = "/_plumix/debug/mail";

/**
 * Expects a base-stripped pathname. Keep this module free of imports: the
 * history writer reaches it on a path that has to stay prod-lean.
 */
export function isDebugMailPath(pathname: string): boolean {
  return (
    pathname === DEBUG_MAIL_PATH || pathname.startsWith(`${DEBUG_MAIL_PATH}/`)
  );
}

/** The telemetry namespace a sent mail is recorded under, and its panel. */
export const DEBUG_MAIL_PANEL_ID = "mail";
