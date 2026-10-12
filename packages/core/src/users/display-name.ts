/** The user's trimmed name, or their email when they never set one. */
export function userDisplayName(user: {
  readonly name?: string | null;
  readonly email: string;
}): string {
  const name = user.name?.trim();
  return name !== undefined && name !== "" ? name : user.email;
}
