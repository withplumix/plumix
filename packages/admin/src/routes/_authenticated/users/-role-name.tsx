import type { ReactNode } from "react";
import { useLabel } from "@/lib/use-label.js";
import { Trans } from "@lingui/react";

import type { RoleManifestEntry } from "@plumix/core/manifest";

/** A stored role the config doesn't declare reads as unknown, not a crash. */
export function RoleName({
  role,
  roles,
}: {
  readonly role: string;
  readonly roles: readonly RoleManifestEntry[];
}): ReactNode {
  const label = useLabel();
  const declared = roles.find((entry) => entry.name === role);
  if (declared) return label(declared.label);
  return (
    <Trans
      id="users.role.unknown"
      message="Unknown role {role}"
      values={{ role: <code>{role}</code> }}
    />
  );
}
