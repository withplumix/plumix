"use client";

import type { IslandProps } from "plumix/blocks";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { authClient } from "plumix/auth/client";

export function AccountMenu(_props: IslandProps<object>): ReactNode {
  const { user, isPending } = authClient.useSession();
  const canEditOwn = authClient.useCan("user:edit_own");
  if (isPending) return null;
  const permission = (
    <span data-testid="account-can-edit-own">{String(canEditOwn)}</span>
  );
  if (user === null) {
    return (
      <div>
        {permission}
        <a href="/sign-in" data-testid="account-signed-out">
          Sign in
        </a>
      </div>
    );
  }
  return (
    <div>
      {permission}
      <span data-testid="account-email">{user.email}</span>
      <span data-testid="account-name">{user.name}</span>
      <ProfileForm />
      <button
        type="button"
        onClick={() => void authClient.signOut()}
        data-testid="account-sign-out"
      >
        Sign out
      </button>
    </div>
  );
}

function ProfileForm(): ReactNode {
  const { account } = authClient.useAccount();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  if (account === null) return null;

  async function save(): Promise<void> {
    const name = input.current?.value ?? "";
    const result = await authClient.account.update({ name });
    setError(result.error?.code ?? "");
  }

  return (
    <form
      data-testid="account-profile"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <input
        ref={input}
        name="name"
        defaultValue={account.name ?? ""}
        data-testid="account-name-input"
      />
      <button type="submit" data-testid="account-save">
        Save
      </button>
      <span data-testid="account-error">{error}</span>
    </form>
  );
}
