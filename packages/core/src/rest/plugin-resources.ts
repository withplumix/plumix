import * as v from "valibot";

import type {
  PluginRouteAuth,
  RegisteredRestResource,
} from "../plugin/manifest.js";
import type { RestContext } from "./base.js";
import type { RestErrors } from "./errors.js";
import { base } from "./base.js";

// Enforce the declarative route-auth model before a plugin handler runs:
// `public` is open; `authenticated` requires a real bearer principal (not the
// anonymous public one); a capability gate defers to the principal's grants.
function enforceRestAuth(
  auth: PluginRouteAuth,
  context: RestContext,
  errors: RestErrors,
): void {
  if (auth === "public") return;
  if (auth === "authenticated") {
    if (!context.restAuthenticated) throw errors.UNAUTHORIZED();
    return;
  }
  if (!context.auth.can(auth.capability)) {
    throw errors.FORBIDDEN({ data: { capability: auth.capability } });
  }
}

const EMPTY_INPUT = v.object({});

// Build oRPC procedures for plugin resources, keyed by index (OpenAPI routing
// is driven by each procedure's `route`, not the object key).
export function buildPluginRestRouter(
  resources: readonly RegisteredRestResource[],
): Record<string, unknown> {
  const router: Record<string, unknown> = {};
  resources.forEach((resource, index) => {
    router[`pluginResource${index}`] = base
      // oRPC types `path` as a `/${string}` literal; the leading slash is
      // enforced by `assertValidRestResourcePath` at registration.
      .route({ method: resource.method, path: resource.path as `/${string}` })
      .input(resource.input ?? EMPTY_INPUT)
      .output(resource.output)
      .handler(({ input, context, errors }) => {
        enforceRestAuth(resource.auth, context, errors);
        return resource.handler({ input, context });
      });
  });
  return router;
}
