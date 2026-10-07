import type { ReactNode } from "react";
import { isSurfaceOffered } from "@/lib/admin-areas.js";
import { hasCap } from "@/lib/caps.js";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { MailerPage } from "./-mailer-page.js";

export const Route = createFileRoute("/_authenticated/mailer/")({
  beforeLoad: ({ context }) => {
    // The sidebar drops Mailer where email delivery is refused; a direct link
    // lands nowhere either.
    if (
      !hasCap(context.user.capabilities, "settings:manage") ||
      !isSurfaceOffered("mailerPage")
    ) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirect pattern
      throw redirect({ to: "/" });
    }
  },
  component: MailerRoute,
});

function MailerRoute(): ReactNode {
  const { user } = Route.useRouteContext();
  return <MailerPage defaultRecipient={user.email} />;
}
