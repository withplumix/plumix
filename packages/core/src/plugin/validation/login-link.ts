import type { LoginLinkOptions } from "../manifest.js";
import { PluginContextError } from "../errors.js";

// Lowercase alphanum + dash/underscore, 1–32 chars, must start with a
// letter. Matches `OAUTH_PROVIDER_KEY_PATTERN` exactly so keys read
// consistently across login-button surfaces. Leading-letter constraint
// keeps the wire id `${pluginId}:${key}` from looking like an opaque
// numeric identifier in logs.
const LOGIN_LINK_KEY_RE = /^[a-z][a-z0-9_-]{0,31}$/;

export function assertValidLoginLink(
  pluginId: string,
  options: LoginLinkOptions,
): void {
  if (!LOGIN_LINK_KEY_RE.test(options.key)) {
    throw PluginContextError.invalidLoginLinkKey({
      pluginId,
      key: options.key,
    });
  }
  if (options.label.length === 0) {
    throw PluginContextError.loginLinkEmptyLabel({
      pluginId,
      key: options.key,
    });
  }
  // CR/LF defense: label is rendered into HTML by the admin, but a
  // future logger / audit-trail consumer might splice it into a
  // line-oriented format. Block at the boundary.
  if (/[\r\n]/.test(options.label)) {
    throw PluginContextError.loginLinkLabelHasCrLf({
      pluginId,
      key: options.key,
    });
  }
  // href must be a same-origin path or an https:// URL — block
  // `javascript:`, `data:`, protocol-relative `//`, and other schemes
  // a misconfigured or hostile plugin might surface.
  const isSameOriginPath =
    options.href.startsWith("/") && !options.href.startsWith("//");
  const isHttps = options.href.startsWith("https://");
  if (!isSameOriginPath && !isHttps) {
    throw PluginContextError.invalidLoginLinkHref({
      pluginId,
      key: options.key,
      href: options.href,
    });
  }
}
