import type { ReactNode } from "react";
import { loadSession } from "@/lib/session.js";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { LoginScreen } from "./-login-screen.js";
import { loginSearchSchema } from "./-schemas.js";

export const Route = createFileRoute("/_auth/login")({
  validateSearch: loginSearchSchema,
  beforeLoad: async ({ context }) => {
    const session = await loadSession(context.queryClient);
    if (session.needsBootstrap) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirect pattern
      throw redirect({ to: "/bootstrap" });
    }
  },
  component: LoginRoute,
});

function LoginRoute(): ReactNode {
  return <LoginScreen search={Route.useSearch()} />;
}
