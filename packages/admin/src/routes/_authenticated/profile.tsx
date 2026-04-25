import { createFileRoute, redirect } from "@tanstack/react-router";

// `/profile` is a stable-URL alias for editing your own account. It
// resolves to `/users/${session.user.id}` so there's one edit
// implementation — the user row decides self-vs-other internally (role
// dropdown hidden for self, no delete button, etc). Matches WP's
// `profile.php` being a thin wrapper around `user-edit.php?user_id=self`.
export const Route = createFileRoute("/_authenticated/profile")({
  beforeLoad: ({ context }) => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirect pattern
    throw redirect({
      to: "/users/$id/edit",
      params: { id: context.user.id },
    });
  },
});
