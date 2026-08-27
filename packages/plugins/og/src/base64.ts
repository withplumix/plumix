// Chunked rather than spread whole: a card-sized image is megabytes of
// arguments, which is a stack overflow rather than a slow call.
const CHUNK_BYTES = 0x8000;

/** Base64 for rendered bytes — a remote payload's image, a preview's data URI. */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + CHUNK_BYTES),
    );
  }
  return btoa(binary);
}
