/** Core's `/_plumix/oauth/authorize`, which decides again now the person is signed in. */
export function authorizeUrl(
  basePath: string,
  request: Readonly<Record<string, string | undefined>>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(request)) {
    if (value !== undefined) params.set(key, value);
  }
  return `${basePath}/_plumix/oauth/authorize?${params.toString()}`;
}
