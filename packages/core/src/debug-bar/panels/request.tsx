import type { AppContext } from "../../context/app.js";
import type { DebugPanel } from "../types.js";
import { DebugKV } from "../primitives.js";

/**
 * The Request panel: how the router saw this request. All read straight
 * off the app context — no instrumentation needed.
 */
export const requestPanel: DebugPanel = {
  id: "request",
  title: "Request",
  order: 10,
  render: (ctx: AppContext) => {
    const url = new URL(ctx.request.url);
    return (
      <DebugKV
        rows={[
          { label: "Method", value: ctx.request.method },
          { label: "Path", value: url.pathname },
          { label: "Origin", value: ctx.origin },
          { label: "Base path", value: ctx.basePath || "/" },
          { label: "Entity", value: ctx.resolvedEntity?.kind ?? "—" },
        ]}
      />
    );
  },
};
