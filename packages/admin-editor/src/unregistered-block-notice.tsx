import type { ReactElement } from "react";
import { Trans } from "@lingui/react";

/** In place of a panel's controls: the block is kept exactly as it was saved. */
export function UnregisteredBlockNotice({
  name,
  testId,
}: {
  readonly name: string;
  readonly testId: string;
}): ReactElement {
  return (
    <p className="text-muted-foreground p-4 text-sm" data-testid={testId}>
      <Trans
        id="editor.unregistered.notice"
        message="{name} isn't registered on this site, so it can't be edited. It's kept as-is and not shown on the live site."
        values={{ name }}
      />
    </p>
  );
}
