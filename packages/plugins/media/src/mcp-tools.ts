import type { McpTool } from "plumix/plugin";
import { McpToolError } from "plumix/plugin";
import * as v from "valibot";

import {
  getMedia,
  listMedia,
  mediaListInputSchema,
  MediaReadError,
} from "./read-service.js";

const mediaGetInputSchema = v.object({
  id: v.pipe(v.number(), v.integer(), v.minValue(1)),
});

function asMcpToolError(error: unknown): McpToolError {
  if (!(error instanceof MediaReadError)) throw error;
  switch (error.data.code) {
    case "not_found":
      return McpToolError.notFound(error.message);
    case "forbidden":
      return McpToolError.forbidden(error.message);
  }
}

export const mediaListTool: McpTool<typeof mediaListInputSchema> = {
  name: "media_list",
  description:
    "List published media (images, files) with optional MIME and filename filters, paginated. Clamped to what your token may read.",
  inputSchema: mediaListInputSchema,
  async run(ctx, input) {
    try {
      return await listMedia(ctx, input);
    } catch (error) {
      throw asMcpToolError(error);
    }
  },
};

export const mediaGetTool: McpTool<typeof mediaGetInputSchema> = {
  name: "media_get",
  description: "Read a single published media item in full by its id.",
  inputSchema: mediaGetInputSchema,
  async run(ctx, input) {
    try {
      return await getMedia(ctx, input);
    } catch (error) {
      throw asMcpToolError(error);
    }
  },
};
