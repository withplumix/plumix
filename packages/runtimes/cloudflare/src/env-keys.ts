// Shared so r2() and images() derive the public-URL key identically.

// Default R2 bucket binding name used across the scaffold. images() has no
// binding of its own, so it falls back to this bucket's public-URL key.
export const DEFAULT_MEDIA_BINDING = "MEDIA";

/**
 * Public custom-domain base for a bucket's objects. r2({ binding }) and
 * images() both read `<BINDING>_PUBLIC_URL_BASE`; sharing this helper keeps
 * them aligned.
 */
export function publicUrlBaseKey(binding: string): string {
  return `${binding}_PUBLIC_URL_BASE`;
}

// S3-API bucket name for a binding — the S3 endpoint addresses by bucket name,
// not by the native binding handle.
export function bucketNameKey(binding: string): string {
  return `${binding}_BUCKET`;
}
