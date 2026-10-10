import type { OpenAPI } from "@orpc/openapi";
import type { AnyRouter } from "@orpc/server";
import type { OverrideSchemaContext } from "@valibot/to-json-schema";
import { OpenAPIGenerator } from "@orpc/openapi";
import { experimental_ValibotToJsonSchemaConverter } from "@orpc/valibot";

/**
 * `v.date()` has no JSON Schema form, so the converter emits `{}`; on the wire
 * a Date serializes as its ISO string, which is what the spec should promise.
 */
function dateAsDateTime({ valibotSchema }: OverrideSchemaContext) {
  return valibotSchema.type === "date"
    ? { type: "string" as const, format: "date-time" }
    : undefined;
}

/**
 * Generated from the merged router (core + plugin resources) so plugin
 * endpoints appear in the spec automatically.
 */
export function generateOpenApiDocument(
  router: AnyRouter,
): Promise<OpenAPI.Document> {
  const generator = new OpenAPIGenerator({
    schemaConverters: [
      new experimental_ValibotToJsonSchemaConverter({
        overrideSchema: dateAsDateTime,
      }),
    ],
  });
  return generator.generate(router, {
    info: { title: "Plumix REST API", version: "1.0.0" },
  });
}
