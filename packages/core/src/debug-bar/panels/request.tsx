import type { AppContext } from "../../context/app.js";
import type { DebugPanel } from "../types.js";
import { DebugKV, DebugSection } from "../primitives.js";

/**
 * The Request panel: the full context of this request — how the router saw it,
 * and who made it. All read straight off the app context, no instrumentation.
 */
export const requestPanel: DebugPanel = {
  id: "request",
  title: "Request",
  order: 10,
  render: (ctx: AppContext) => {
    const url = new URL(ctx.request.url);
    return (
      <>
        <DebugSection title="Request">
          <DebugKV
            rows={[
              { label: "Method", value: ctx.request.method },
              { label: "Path", value: url.pathname },
              { label: "Origin", value: ctx.origin },
              { label: "Base path", value: ctx.basePath || "/" },
              { label: "Entity", value: ctx.resolvedEntity?.kind ?? "—" },
            ]}
          />
        </DebugSection>
        <DebugSection title="Auth">
          <DebugKV
            rows={[
              {
                label: "User",
                value: ctx.user
                  ? `${ctx.user.email} (${ctx.user.role})`
                  : "anonymous",
              },
              {
                label: "Scopes",
                value:
                  ctx.tokenScopes === null
                    ? "unrestricted (role caps)"
                    : ctx.tokenScopes.join(", ") || "none",
              },
            ]}
          />
        </DebugSection>
      </>
    );
  },
};
