import type { DebugSnapshot } from "../snapshot.js";
import type { DebugPanel } from "../types.js";
import { DebugKV, DebugSection } from "../primitives.js";

/**
 * The Request panel: the full context of this request — how the router saw it,
 * and who made it. All read from the snapshot's context projection.
 */
export const requestPanel: DebugPanel = {
  id: "request",
  title: "Request",
  order: 10,
  render: ({ context }: DebugSnapshot) => (
    <>
      <DebugSection title="Request">
        <DebugKV
          rows={[
            { label: "Method", value: context.method },
            { label: "Path", value: context.path },
            { label: "Origin", value: context.origin },
            { label: "Base path", value: context.basePath || "/" },
            { label: "Entity", value: context.resolvedEntity?.kind ?? "—" },
          ]}
        />
      </DebugSection>
      <DebugSection title="Auth">
        <DebugKV
          rows={[
            {
              label: "User",
              value: context.user
                ? `${context.user.email} (${context.user.role})`
                : "anonymous",
            },
            {
              label: "Scopes",
              value:
                context.tokenScopes === null
                  ? "unrestricted (role caps)"
                  : context.tokenScopes.join(", ") || "none",
            },
          ]}
        />
      </DebugSection>
    </>
  ),
};
