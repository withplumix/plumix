import type { ReactElement } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar.js";

interface CoAuthor {
  readonly id: number;
  readonly name: string | null;
  readonly email: string;
  readonly lastSeenAt: Date;
}

interface CoAuthorIndicatorProps {
  readonly users: readonly CoAuthor[];
  readonly relativeTime: (date: Date) => string;
}

// Shown next to the autosave pill when one or more co-authors are
// actively editing the same entry. Renders nothing when the list is
// empty so the header stays uncluttered for solo editing — which is
// the common case.
export function CoAuthorIndicator({
  users,
  relativeTime,
}: CoAuthorIndicatorProps): ReactElement | null {
  if (users.length === 0) return null;
  return (
    <div
      data-testid="coauthor-indicator"
      className="flex items-center gap-2 text-xs"
    >
      {/*
        Each avatar carries an `aria-label` so screen-reader users get
        the identity per item, not just the container count. The
        visible name+timestamp list below is `sr-only md:block` so
        mobile users (where the visible list is hidden for space) still
        get the SR text — `hidden` would also strip it from a11y.
       */}
      <ul className="flex -space-x-1.5" aria-label="Active co-authors">
        {users.map((user) => {
          const display = user.name ?? user.email;
          const lastSeen = relativeTime(user.lastSeenAt);
          return (
            <li key={user.id}>
              <Avatar
                size="sm"
                className="ring-background ring-2"
                aria-label={`${display} · last seen ${lastSeen}`}
              >
                <AvatarFallback
                  data-testid={`coauthor-avatar-fallback-${String(user.id)}`}
                >
                  {initialFor(user)}
                </AvatarFallback>
              </Avatar>
            </li>
          );
        })}
      </ul>
      <ul className="text-muted-foreground sr-only md:not-sr-only md:block">
        {users.map((user) => (
          <li key={user.id} className="truncate">
            <span className="text-foreground font-medium">
              {user.name ?? user.email}
            </span>
            <span> · {relativeTime(user.lastSeenAt)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function initialFor(user: CoAuthor): string {
  const source = user.name ?? user.email;
  const first = source.trim().charAt(0);
  return first.toUpperCase();
}
