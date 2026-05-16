import { PluginContextError } from "../errors.js";

// Shared `/`-anchored path validation: must start with /, no `//` or
// `..` traversal, no `?` / `#` (we match on pathname only). The
// admin-page and plugin-route validators diverge after this on how
// they handle `*`, so the wildcard rule stays at each call site.
function assertValidPathPrefix(
  pluginId: string,
  path: string,
  kind: string,
): void {
  if (!path.startsWith("/")) {
    throw PluginContextError.pathMustStartWithSlash({ pluginId, kind, path });
  }
  if (path.includes("//") || path.includes("..")) {
    throw PluginContextError.pathContainsTraversal({ pluginId, kind, path });
  }
  if (path.includes("?") || path.includes("#")) {
    throw PluginContextError.pathContainsQueryOrFragment({
      pluginId,
      kind,
      path,
    });
  }
}

export function assertValidAdminPagePath(pluginId: string, path: string): void {
  assertValidPathPrefix(pluginId, path, "admin page");
  if (path.includes("*")) {
    throw PluginContextError.adminPagePathContainsWildcard({ pluginId, path });
  }
}

export function assertValidPluginRoutePath(
  pluginId: string,
  path: string,
): void {
  assertValidPathPrefix(pluginId, path, "route");
  // Allow exactly `/*` at the very end. Any other `*` is ambiguous.
  const starIndex = path.indexOf("*");
  if (starIndex !== -1 && starIndex !== path.length - 1) {
    throw PluginContextError.routePathWildcardNotAtEnd({ pluginId, path });
  }
  if (
    path.endsWith("*") &&
    (path.length < 2 || path[path.length - 2] !== "/")
  ) {
    throw PluginContextError.routePathWildcardNotAfterSlash({ pluginId, path });
  }
}
