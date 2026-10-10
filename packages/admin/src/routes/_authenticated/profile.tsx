import { createFileRoute, redirect } from "@tanstack/react-router";

// An alias so there's one edit implementation; the user screen handles
// self-vs-other.
export const Route = createFileRoute("/_authenticated/profile")({
  beforeLoad: ({ context }) => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirect pattern
    throw redirect({
      to: "/users/$id/edit",
      params: { id: context.user.id },
    });
  },
});
