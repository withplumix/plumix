import type { OpenAPI } from "@orpc/openapi";
import type { AnyRouter } from "@orpc/server";
import { OpenAPIGenerator } from "@orpc/openapi";
import { experimental_ValibotToJsonSchemaConverter } from "@orpc/valibot";

// Generated from the merged router (core + plugin resources) so plugin
// endpoints appear in the spec automatically.
export function generateOpenApiDocument(
  router: AnyRouter,
): Promise<OpenAPI.Document> {
  const generator = new OpenAPIGenerator({
    schemaConverters: [new experimental_ValibotToJsonSchemaConverter()],
  });
  return generator.generate(router, {
    info: { title: "Plumix REST API", version: "1.0.0" },
  });
}
