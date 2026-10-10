// Upload fakes: a real `File` to hand an upload field, a drop zone or an RPC
// procedure, in either test tier. Nothing here reaches for a Node built-in —
// the browser build of `plumix/test` serves this module as it is.

export interface FakeFileOptions {
  /** That many zero bytes. Ignored when `content` is given. */
  readonly size?: number;
  readonly content?: string | ArrayBuffer | ArrayBufferView<ArrayBuffer>;
  /** Defaults from the name's extension. */
  readonly type?: string;
  readonly lastModified?: number;
}

export interface FakeImageOptions {
  readonly width?: number;
  readonly height?: number;
  readonly lastModified?: number;
}

const TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  zip: "application/zip",
};

function typeFromName(name: string): string {
  const dot = name.lastIndexOf(".");
  const extension = dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
  return TYPE_BY_EXTENSION[extension] ?? "application/octet-stream";
}

/**
 * A `File` named `name`: empty, `size` zero bytes, or holding `content`. Its
 * type follows the extension unless `type` says otherwise.
 */
export function fakeFile(name: string, options: FakeFileOptions = {}): File {
  const content = options.content ?? new Uint8Array(options.size ?? 0);
  return new File([content], name, {
    type: options.type ?? typeFromName(name),
    lastModified: options.lastModified,
  });
}

/**
 * A `File` holding a valid PNG of `width` × `height` white pixels, which a
 * browser decodes and a magic-byte or header check accepts. PNG is the only
 * format generated, so the name has to end in `.png`.
 */
export function fakeImage(
  name = "image.png",
  options: FakeImageOptions = {},
): File {
  if (!/\.png$/i.test(name))
    throw new TypeError(
      `fakeImage generates PNG only, so "${name}" has to end in ".png".`,
    );
  const { width = 10, height = 10 } = options;
  return new File([encodePng(width, height)], name, {
    type: "image/png",
    lastModified: options.lastModified,
  });
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** 8-bit grayscale, one filter byte (none) ahead of each row. */
function encodePng(width: number, height: number): Uint8Array<ArrayBuffer> {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;
  const row = width + 1;
  const pixels = new Uint8Array(row * height).fill(0xff);
  for (let y = 0; y < height; y++) pixels[y * row] = 0;
  return concat([
    Uint8Array.from(PNG_SIGNATURE),
    chunk("IHDR", header),
    chunk("IDAT", zlibStored(pixels)),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/**
 * A zlib stream of uncompressed deflate blocks: valid for any decoder, and
 * no compressor to carry.
 */
function zlibStored(data: Uint8Array): Uint8Array {
  const MAX_BLOCK = 0xffff;
  const blocks: Uint8Array[] = [Uint8Array.from([0x78, 0x01])];
  let offset = 0;
  do {
    const length = Math.min(MAX_BLOCK, data.length - offset);
    const block = new Uint8Array(5 + length);
    block[0] = offset + length >= data.length ? 1 : 0;
    block[1] = length & 0xff;
    block[2] = length >>> 8;
    block[3] = ~length & 0xff;
    block[4] = (~length >>> 8) & 0xff;
    block.set(data.subarray(offset, offset + length), 5);
    blocks.push(block);
    offset += length;
  } while (offset < data.length);
  const checksum = new Uint8Array(4);
  new DataView(checksum.buffer).setUint32(0, adler32(data));
  blocks.push(checksum);
  return concat(blocks);
}

function concat(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes)
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}
