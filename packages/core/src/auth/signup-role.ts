interface SignupRoleInput {
  readonly email: string;
  /** `auth.allowedDomains`: a lowercase domain → its role. */
  readonly allowedDomains?: Readonly<Record<string, string>>;
  /** The role every unlisted domain gets; omit it to refuse them. */
  readonly defaultRole?: string;
}

/** `undefined` when the email may not sign up. */
export function signupRole(input: SignupRoleInput): string | undefined {
  const domain = extractDomain(input.email);
  if (domain === null) return undefined;
  const { allowedDomains } = input;
  if (allowedDomains !== undefined && Object.hasOwn(allowedDomains, domain)) {
    return allowedDomains[domain];
  }
  return input.defaultRole;
}

/** Returns null, not a throw, for input not shaped like `local@domain`. */
export function extractDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase();
}
