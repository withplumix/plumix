import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";

import type {
  EditConflictDialogProps,
  EditingCopy,
  EditLease,
  EditLeaseBannerProps,
  EditLeaseKind,
} from "@plumix/core/admin";

import { AdminRuntimeError } from "../errors.js";
import { EditConflictDialog, EditLeaseBanner, useEditLease } from "./index.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const COPY: EditingCopy = {
  conflictTitle: { id: "test.conflict", message: "It changed" },
  heldBy: { id: "test.heldBy", message: "{name} is editing" },
  lost: { id: "test.lost", message: "{name} took over" },
};

/** What the admin shell publishes once it has booted. */
function bootShell(editing: object): void {
  vi.stubGlobal("plumix", { editing });
}

describe("EditLeaseBanner", () => {
  test("renders the banner the admin shell published", () => {
    bootShell({
      EditLeaseBanner: ({ notice }: EditLeaseBannerProps): ReactElement => (
        <p>shell banner: {notice.name}</p>
      ),
    });

    const html = renderToString(
      <EditLeaseBanner
        copy={COPY}
        notice={{ kind: "heldByOther", name: "Ada", since: new Date(0) }}
        onTakeOver={() => undefined}
        isTakingOver={false}
        onBack={() => undefined}
      />,
    );

    expect(html).toContain("shell banner: <!-- -->Ada");
  });

  test("throws before the admin shell has booted", () => {
    const render = (): string =>
      renderToString(
        <EditLeaseBanner
          copy={COPY}
          notice={{ kind: "lost", name: "Ada", at: new Date(0) }}
          onTakeOver={() => undefined}
          isTakingOver={false}
          onBack={() => undefined}
        />,
      );

    expect(render).toThrow(AdminRuntimeError);
  });
});

describe("EditConflictDialog", () => {
  test("renders the conflict dialog the admin shell published", () => {
    bootShell({
      EditConflictDialog: ({
        editingElsewhere,
      }: EditConflictDialogProps): ReactElement => (
        <p>shell dialog: {editingElsewhere?.name}</p>
      ),
    });

    const html = renderToString(
      <EditConflictDialog
        copy={COPY}
        open
        changedAt={null}
        editingElsewhere={{ id: 2, name: "Ada" }}
        mineSnapshot={{ alt: "mine" }}
        theirsSnapshot={{ alt: "theirs" }}
        onKeepMine={() => undefined}
        onLoadTheirs={() => undefined}
      />,
    );

    expect(html).toContain("shell dialog: <!-- -->Ada");
  });
});

describe("useEditLease", () => {
  test("holds the resource's lease through the admin shell's hook", () => {
    bootShell({
      useEditLease: (kind: EditLeaseKind, id: number): EditLease => ({
        state: {
          kind: "heldByOther",
          holder: { id: 2, name: `holder of ${kind} ${String(id)}` },
          since: new Date(0),
        },
        takeOver: () => Promise.resolve(),
        lose: () => undefined,
      }),
    });
    function MediaDrawer(): ReactElement {
      const lease = useEditLease("entry", 42);
      return (
        <p>{lease.state.kind === "heldByOther" && lease.state.holder.name}</p>
      );
    }

    const html = renderToString(<MediaDrawer />);

    expect(html).toContain("holder of entry 42");
  });
});
