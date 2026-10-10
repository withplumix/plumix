import * as v from "valibot";

import type { Entry } from "../db/schema/entries.js";
import type {
  RegisteredEntryType,
  RegisteredRestResource,
  RestResourceAuth,
} from "../plugin/manifest.js";
import type { RestContext } from "./base.js";
import type { RestErrors } from "./contract/errors.js";
import { resolveCapability } from "../access/contract/capability.js";
import { findReadableEntry } from "../entries/read-service.js";
import { base } from "./base.js";
import { entryNotFound } from "./entries-resource.js";
import { resolvePublicEntryType } from "./rest-base.js";

// `authenticated` requires a real bearer principal, not the anonymous public
// one.
function enforceRestAuth(
  auth: RestResourceAuth,
  context: RestContext,
  errors: RestErrors,
): void {
  if (auth === "public") return;
  if (auth === "authenticated") {
    if (!context.restAuthenticated) throw errors.UNAUTHORIZED();
    return;
  }
  if (!context.auth.can(auth.capability)) {
    throw errors.FORBIDDEN({
      data: { capability: resolveCapability(context.plugins, auth.capability) },
    });
  }
}

const EMPTY_INPUT = v.object({});

const BOUND_SEGMENTS = ["collection", "entry"] as const;
type BoundSegment = (typeof BOUND_SEGMENTS)[number];

interface Bindings {
  entryType?: RegisteredEntryType;
  entry?: Entry;
}

// Resolved through core's own collection and entry-read rules so they never
// disagree. Every bind failure is the same NOT_FOUND, so ids can't be probed.
async function bindSegments(
  params: Partial<Record<BoundSegment, string>>,
  context: RestContext,
  errors: RestErrors,
): Promise<Bindings> {
  const bindings: Bindings = {};
  if (params.collection !== undefined) {
    const entryType = resolvePublicEntryType(
      context.plugins,
      params.collection,
    );
    if (!entryType) throw errors.NOT_FOUND({ data: { kind: "collection" } });
    bindings.entryType = entryType;
  }
  if (params.entry !== undefined) {
    const id = Number(params.entry);
    if (!Number.isInteger(id) || id < 1) {
      throw errors.NOT_FOUND({ data: { kind: "entry" } });
    }
    let entry: Entry;
    try {
      entry = await findReadableEntry(context, { id });
    } catch (error) {
      throw entryNotFound(error, errors) ?? error;
    }
    if (bindings.entryType && entry.type !== bindings.entryType.name) {
      throw errors.NOT_FOUND({ data: { kind: "entry" } });
    }
    bindings.entry = entry;
  }
  return bindings;
}

function boundSegmentsOf(path: string): readonly BoundSegment[] {
  return BOUND_SEGMENTS.filter((name) => path.includes(`{${name}}`));
}

// Bound segments join the schema so oRPC routes and documents them, then are
// split back out before the handler sees `input`.
/* eslint-disable @typescript-eslint/no-explicit-any -- a resource's input is any plugin's valibot schema */
function inputSchemaOf(
  resource: RegisteredRestResource,
  bound: readonly BoundSegment[],
): any {
  if (bound.length === 0) return resource.input ?? EMPTY_INPUT;
  const segments = v.object(
    Object.fromEntries(bound.map((name) => [name, v.string()])),
  );
  return resource.input === undefined
    ? segments
    : v.intersect([resource.input, segments]);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Not JSON: values are whatever the plugin's schema decodes them to, `Date`s
// and `File`s included.
type BoundResourceInput = Record<string, unknown>;

// Split the bound segments' raw values out of the parsed input.
function splitBound(
  input: BoundResourceInput,
  bound: readonly BoundSegment[],
): {
  params: Partial<Record<BoundSegment, string>>;
  own: BoundResourceInput;
} {
  const params: Partial<Record<BoundSegment, string>> = {};
  const own = { ...input };
  for (const name of bound) {
    params[name] = String(own[name]);
    delete own[name];
  }
  return { params, own };
}

// Not JSON: the values are live oRPC procedures, handler closures with route
// metadata attached.
type PluginRestRouter = Record<string, unknown>;

// Build oRPC procedures for plugin resources, keyed by index (OpenAPI routing
// is driven by each procedure's `route`, not the object key).
export function buildPluginRestRouter(
  resources: readonly RegisteredRestResource[],
): PluginRestRouter {
  const router: Record<string, unknown> = {};
  resources.forEach((resource, index) => {
    const bound = boundSegmentsOf(resource.path);
    router[`pluginResource${index}`] = base
      // oRPC types `path` as a `/${string}` literal; the leading slash is
      // enforced by `assertValidRestResourcePath` at registration.
      .route({ method: resource.method, path: resource.path as `/${string}` })
      .input(inputSchemaOf(resource, bound))
      .output(resource.output)
      .handler(async ({ input, context, errors }) => {
        enforceRestAuth(resource.auth, context, errors);
        if (bound.length === 0) {
          return resource.handler({ input, context, errors });
        }
        const { params, own } = splitBound(input as BoundResourceInput, bound);
        const bindings = await bindSegments(params, context, errors);
        return resource.handler({ input: own, context, errors, ...bindings });
      });
  });
  return router;
}
