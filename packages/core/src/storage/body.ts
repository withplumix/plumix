import type { ObjectBody } from "../runtime/slots.js";

/** Read any `ObjectBody` the port accepts into one contiguous byte array. */
export async function bodyToBytes(body: ObjectBody): Promise<Uint8Array> {
  if (body === null) return new Uint8Array(0);
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (body instanceof ArrayBuffer) return new Uint8Array(body.slice(0));
  if (ArrayBuffer.isView(body)) {
    return new Uint8Array(
      body.buffer,
      body.byteOffset,
      body.byteLength,
    ).slice();
  }
  // Blob or ReadableStream: `Response` already knows how to drain both.
  return new Uint8Array(await new Response(body).arrayBuffer());
}

// Avoids the `SharedArrayBuffer` union that `.slice()` introduces.
export function toFreshArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}
