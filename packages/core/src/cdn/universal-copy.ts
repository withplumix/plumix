import { withHeaders } from "../runtime/contract/http.js";

/** Internal to the store: every client copy strips it before a response leaves. */
export const UNIVERSAL_COPY_HEADER = "x-plumix-universal-copy";

export function markUniversalCopy(response: Response): Response {
  return withHeaders(response, (headers) => {
    headers.set(UNIVERSAL_COPY_HEADER, "1");
  });
}

export function isUniversalCopy(response: Response): boolean {
  return response.headers.has(UNIVERSAL_COPY_HEADER);
}

export function withoutUniversalMarker(response: Response): Response {
  if (!isUniversalCopy(response)) return response;
  return withHeaders(response, (headers) => {
    headers.delete(UNIVERSAL_COPY_HEADER);
  });
}
