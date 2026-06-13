import type { OpenAPI } from "@orpc/openapi";
import { OpenAPIGenerator } from "@orpc/openapi";
import { experimental_ValibotToJsonSchemaConverter } from "@orpc/valibot";

import { restRouter } from "./router.js";

export function generateOpenApiDocument(): Promise<OpenAPI.Document> {
  const generator = new OpenAPIGenerator({
    schemaConverters: [new experimental_ValibotToJsonSchemaConverter()],
  });
  return generator.generate(restRouter, {
    info: { title: "Plumix REST API", version: "1.0.0" },
  });
}
