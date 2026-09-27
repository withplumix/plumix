import type { ReactNode } from "react";
import { hasCap } from "@/lib/caps.js";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { MailerPage } from "./-mailer-page.js";

export const Route = createFileRoute("/_authenticated/mailer/")({
  beforeLoad: ({ context }) => {
    if (!hasCap(context.user.capabilities, "settings:manage")) {
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
