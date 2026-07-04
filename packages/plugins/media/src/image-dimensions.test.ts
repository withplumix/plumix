import { describe, expect, test } from "vitest";

import { readImageDimensions } from "./image-dimensions.js";

// 800×600 PNG: 8-byte signature, IHDR length + tag, then width/height as BE u32.
// prettier-ignore
const PNG_800x600 = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // signature
  0x00, 0x00, 0x00, 0x0d, // IHDR length
  0x49, 0x48, 0x44, 0x52, // "IHDR"
  0x00, 0x00, 0x03, 0x20, // width = 800
  0x00, 0x00, 0x02, 0x58, // height = 600
]);

describe("readImageDimensions — PNG", () => {
  test("reads width and height from IHDR", () => {
    expect(readImageDimensions(PNG_800x600, "image/png")).toEqual({
      width: 800,
      height: 600,
    });
  });
});

// 800×600 GIF89a: 6-byte magic, then width/height as LE u16.
// prettier-ignore
const GIF_800x600 = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // "GIF89a"
  0x20, 0x03, // width = 800 (LE)
  0x58, 0x02, // height = 600 (LE)
]);

describe("readImageDimensions — GIF", () => {
  test("reads width and height from the logical screen descriptor", () => {
    expect(readImageDimensions(GIF_800x600, "image/gif")).toEqual({
      width: 800,
      height: 600,
    });
  });
});

// 800×600 JPEG: SOI, an APP0 segment (must be skipped), then SOF0 with the
// height/width as BE u16 after the 1-byte precision.
// prettier-ignore
const JPEG_800x600 = new Uint8Array([
  0xff, 0xd8, // SOI
  0xff, 0xe0, 0x00, 0x04, 0xaa, 0xbb, // APP0, length 4
  0xff, 0xc0, 0x00, 0x11, 0x08, // SOF0, length 17, precision 8
  0x02, 0x58, // height = 600
  0x03, 0x20, // width = 800
  0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, // components
]);

describe("readImageDimensions — JPEG", () => {
  test("reads dimensions from the SOF marker past earlier segments", () => {
    expect(readImageDimensions(JPEG_800x600, "image/jpeg")).toEqual({
      width: 800,
      height: 600,
    });
  });
});

// prettier-ignore
const RIFF_WEBP = [
  0x52, 0x49, 0x46, 0x46, // "RIFF"
  0x00, 0x00, 0x00, 0x00, // file size (ignored)
  0x57, 0x45, 0x42, 0x50, // "WEBP"
];

// Extended (VP8X): 1-based canvas width/height minus one as LE u24.
// prettier-ignore
const WEBP_VP8X_800x600 = new Uint8Array([
  ...RIFF_WEBP,
  0x56, 0x50, 0x38, 0x58, // "VP8X"
  0x00, 0x00, 0x00, 0x0a, // chunk size
  0x00, 0x00, 0x00, 0x00, // flags + reserved
  0x1f, 0x03, 0x00, // width - 1 = 799
  0x57, 0x02, 0x00, // height - 1 = 599
]);

// Lossless (VP8L): 0x2f signature, then 14-bit (width-1)/(height-1) bit-packed.
// prettier-ignore
const WEBP_VP8L_800x600 = new Uint8Array([
  ...RIFF_WEBP,
  0x56, 0x50, 0x38, 0x4c, // "VP8L"
  0x00, 0x00, 0x00, 0x00, // chunk size
  0x2f, // signature
  0x1f, 0xc3, 0x95, 0x00, // packed 799 / 599
]);

// Lossy (VP8): 3-byte frame tag, 0x9d012a start code, then 14-bit LE dims.
// prettier-ignore
const WEBP_VP8_800x600 = new Uint8Array([
  ...RIFF_WEBP,
  0x56, 0x50, 0x38, 0x20, // "VP8 "
  0x00, 0x00, 0x00, 0x00, // chunk size
  0x00, 0x00, 0x00, // frame tag
  0x9d, 0x01, 0x2a, // start code
  0x20, 0x03, // width = 800
  0x58, 0x02, // height = 600
]);

describe("readImageDimensions — WebP", () => {
  test("extended (VP8X) canvas dimensions", () => {
    expect(readImageDimensions(WEBP_VP8X_800x600, "image/webp")).toEqual({
      width: 800,
      height: 600,
    });
  });

  test("lossless (VP8L) dimensions", () => {
    expect(readImageDimensions(WEBP_VP8L_800x600, "image/webp")).toEqual({
      width: 800,
      height: 600,
    });
  });

  test("lossy (VP8) dimensions", () => {
    expect(readImageDimensions(WEBP_VP8_800x600, "image/webp")).toEqual({
      width: 800,
      height: 600,
    });
  });

  test("lossy (VP8) with a corrupt start code is rejected", () => {
    const bad = WEBP_VP8_800x600.slice();
    bad[23] = 0x00; // clobber the 0x9d012a key-frame start code
    expect(readImageDimensions(bad, "image/webp")).toBeNull();
  });
});

// AVIF: an ftyp box, then an ispe box carrying version/flags + BE u32 dims.
// prettier-ignore
const AVIF_800x600 = new Uint8Array([
  0x00, 0x00, 0x00, 0x10, 0x66, 0x74, 0x79, 0x70, // ftyp box header
  0x61, 0x76, 0x69, 0x66, 0x00, 0x00, 0x00, 0x00, // brand + minor version
  0x00, 0x00, 0x00, 0x14, 0x69, 0x73, 0x70, 0x65, // ispe box header
  0x00, 0x00, 0x00, 0x00, // version + flags
  0x00, 0x00, 0x03, 0x20, // width = 800
  0x00, 0x00, 0x02, 0x58, // height = 600
]);

// A stray `ispe` byte sequence framed by a bogus box size, followed by the
// real 20-byte ispe box carrying the true dimensions.
// prettier-ignore
const AVIF_STRAY_ISPE = new Uint8Array([
  0x00, 0x00, 0x00, 0x63, 0x69, 0x73, 0x70, 0x65, // fake ispe, wrong box size
  0x00, 0x00, 0x00, 0x00, // version + flags
  0x00, 0x00, 0x01, 0x00, // decoy width = 256
  0x00, 0x00, 0x01, 0x00, // decoy height = 256
  0x00, 0x00, 0x00, 0x14, 0x69, 0x73, 0x70, 0x65, // real ispe box
  0x00, 0x00, 0x00, 0x00, // version + flags
  0x00, 0x00, 0x03, 0x20, // width = 800
  0x00, 0x00, 0x02, 0x58, // height = 600
]);

describe("readImageDimensions — AVIF", () => {
  test("reads dimensions from the ispe box", () => {
    expect(readImageDimensions(AVIF_800x600, "image/avif")).toEqual({
      width: 800,
      height: 600,
    });
  });

  test("skips a stray ispe not framed as a 20-byte box", () => {
    expect(readImageDimensions(AVIF_STRAY_ISPE, "image/avif")).toEqual({
      width: 800,
      height: 600,
    });
  });
});

describe("readImageDimensions — returns null when undeterminable", () => {
  test("SVG has no intrinsic pixel dimensions", () => {
    const svg = new TextEncoder().encode('<svg width="800" height="600"/>');
    expect(readImageDimensions(svg, "image/svg+xml")).toBeNull();
  });

  test("unknown mime", () => {
    expect(readImageDimensions(PNG_800x600, "application/pdf")).toBeNull();
  });

  test("buffer too short to reach the header", () => {
    expect(
      readImageDimensions(PNG_800x600.subarray(0, 16), "image/png"),
    ).toBeNull();
  });

  test("bytes that don't match the claimed format", () => {
    const garbage = new Uint8Array(40).fill(0);
    expect(readImageDimensions(garbage, "image/jpeg")).toBeNull();
  });
});
