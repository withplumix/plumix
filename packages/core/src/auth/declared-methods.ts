import type { AnyPluginDescriptor } from "../config.js";
import type {
  AuthMethodDefinition,
  AuthMethodRoute,
} from "../plugin/auth-method.js";
import { AppBootError } from "../runtime/contract/errors.js";
import { AUTH_CLIENT_KERNEL_KEYS, camelCase } from "./client/kernel-keys.js";

const AUTH_PREFIX = "/_plumix/auth/";

const AUTH_METHOD_NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** Core's own `/_plumix/auth/<name>` routes, which no method may mount over. */
const CORE_AUTH_ROUTE_PREFIXES: ReadonlySet<string> = new Set([
  "device",
  "signout",
  "verify-email",
]);

const KERNEL_KEYS: ReadonlySet<string> = new Set(AUTH_CLIENT_KERNEL_KEYS);

interface CompiledRoute {
  readonly segments: readonly string[];
  readonly route: AuthMethodRoute;
}

export interface DeclaredAuthMethod {
  /** `core`, or the id of the plugin that declared it. */
  readonly owner: string;
  readonly key: string;
  readonly method: AuthMethodDefinition;
  readonly routes: readonly CompiledRoute[];
}

/** Every declared sign-in method by name, core's first. Built once at boot. */
export type DeclaredAuthMethods = ReadonlyMap<string, DeclaredAuthMethod>;

interface DeclareAuthMethodsInput {
  readonly core: readonly AuthMethodDefinition[];
  readonly plugins: readonly AnyPluginDescriptor[];
}

/**
 * Throws `AppBootError` for a name that isn't a kebab-case slug, one of core's
 * own auth routes, one taking an auth client kernel key, or declared twice.
 */
export function declareAuthMethods(
  input: DeclareAuthMethodsInput,
): DeclaredAuthMethods {
  const owned: [string, AuthMethodDefinition][] = [
    ...input.core.map((method): [string, AuthMethodDefinition] => [
      "core",
      method,
    ]),
    ...input.plugins.flatMap((plugin) =>
      (plugin.authMethods ?? []).map(
        (method): [string, AuthMethodDefinition] => [plugin.id, method],
      ),
    ),
  ];
  const declared = new Map<string, DeclaredAuthMethod>();
  for (const [owner, method] of owned) {
    assertDeclarable(owner, method.name, declared);
    declared.set(method.name, {
      owner,
      key: method.name.replaceAll("-", "_"),
      method,
      routes: Object.entries(method.routes).map(([path, route]) => ({
        segments: path.split("/"),
        route,
      })),
    });
  }
  return declared;
}

function assertDeclarable(
  owner: string,
  name: string,
  declared: DeclaredAuthMethods,
): void {
  if (!AUTH_METHOD_NAME.test(name)) {
    throw AppBootError.authMethodNameInvalid({ pluginId: owner, name });
  }
  if (CORE_AUTH_ROUTE_PREFIXES.has(name)) {
    throw AppBootError.authMethodNameReserved({ pluginId: owner, name });
  }
  const key = camelCase(name);
  if (KERNEL_KEYS.has(key)) {
    throw AppBootError.authMethodNameKernelKey({ pluginId: owner, name, key });
  }
  const previous = declared.get(name);
  if (previous !== undefined) {
    throw AppBootError.authMethodNameConflict({
      pluginId: owner,
      name,
      previousOwner: previous.owner,
    });
  }
}

export type AuthMethodRouteMatch =
  | {
      readonly kind: "route";
      readonly declared: DeclaredAuthMethod;
      readonly route: AuthMethodRoute;
      readonly params: Readonly<Record<string, string>>;
    }
  | { readonly kind: "method-not-allowed"; readonly allow: readonly string[] };

/** `null` when no declared route has this path. */
export function matchAuthMethodRoute(
  methods: DeclaredAuthMethods,
  pathname: string,
  verb: string,
): AuthMethodRouteMatch | null {
  if (!pathname.startsWith(AUTH_PREFIX)) return null;
  const [name = "", ...rest] = pathname.slice(AUTH_PREFIX.length).split("/");
  const declared = methods.get(name);
  if (declared === undefined) return null;
  const allow: string[] = [];
  for (const { segments, route } of declared.routes) {
    const params = matchSegments(segments, rest);
    if (params === null) continue;
    if (route.method === verb.toUpperCase()) {
      return { kind: "route", declared, route, params };
    }
    allow.push(route.method);
  }
  return allow.length === 0 ? null : { kind: "method-not-allowed", allow };
}

function matchSegments(
  pattern: readonly string[],
  actual: readonly string[],
): Record<string, string> | null {
  if (pattern.length !== actual.length) return null;
  const params: Record<string, string> = {};
  for (const [index, segment] of pattern.entries()) {
    const value = actual[index] ?? "";
    if (segment.startsWith(":")) {
      if (value === "") return null;
      params[segment.slice(1)] = value;
    } else if (segment !== value) {
      return null;
    }
  }
  return params;
}
