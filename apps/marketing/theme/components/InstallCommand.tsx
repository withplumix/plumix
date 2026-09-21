import type { ReactNode } from "react";

export function InstallCommand(): ReactNode {
  return (
    <code
      translate="no"
      className="bg-ink text-paper rounded-lg px-5 py-3.5 font-mono text-sm select-all"
      data-testid="install-command"
    >
      <span className="text-paper/50 select-none">$ </span>
      pnpm create plumix-app my-site
    </code>
  );
}
