// Intrinsic pixel-dimension probe for the raster image formats the media
// plugin accepts. Runs at confirm time on the same leading bytes we read for
// the magic-byte sniff, so uploaded images carry width/height without a
// separate decode pass. Returns null whenever dimensions can't be determined
// — a vector format (SVG), an unknown mime, or a sample too short to reach the
// header — and callers treat that as "no dimensions" rather than an error.

export interface ImageDimensions {
  readonly width: number;
  readonly height: number;
}

// Bytes to read for the dimension probe. Larger than the magic-byte sample
// because a JPEG's SOF marker can sit past a big APP1/EXIF block; 64 KiB
// covers the header region of the formats we probe without reading whole files.
export const DIMENSION_SAMPLE_SIZE = 65536;

function readPng(v: DataView): ImageDimensions | null {
  // Signature (8) + IHDR length (4) + "IHDR" (4), then width/height as BE u32.
  if (v.byteLength < 24) return null;
  return { width: v.getUint32(16), height: v.getUint32(20) };
}

function readGif(v: DataView): ImageDimensions | null {
  // "GIF87a"/"GIF89a" (6), then width/height as LE u16 in the screen descriptor.
  if (v.byteLength < 10) return null;
  return { width: v.getUint16(6, true), height: v.getUint16(8, true) };
}

// Start-Of-Frame markers carry the frame dimensions. Excludes 0xC4 (DHT),
// 0xC8 (JPG), 0xCC (DAC), which share the 0xCn range but aren't frame headers.
function isSofMarker(marker: number): boolean {
  return (
    marker >= 0xc0 &&
    marker <= 0xcf &&
    marker !== 0xc4 &&
    marker !== 0xc8 &&
    marker !== 0xcc
  );
}

function readJpeg(v: DataView): ImageDimensions | null {
  const len = v.byteLength;
  if (len < 2 || v.getUint8(0) !== 0xff || v.getUint8(1) !== 0xd8) return null;
  let pos = 2;
  while (pos + 1 < len) {
    if (v.getUint8(pos) !== 0xff || v.getUint8(pos + 1) === 0xff) {
      pos++; // stray fill byte or padding before the next marker
      continue;
    }
    const marker = v.getUint8(pos + 1);
    pos += 2;
    // Standalone markers (SOI/EOI/TEM/RSTn) carry no length segment.
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) continue;
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    if (pos + 1 >= len) return null;
    if (isSofMarker(marker)) {
      // length(2), precision(1), then height/width as BE u16.
      if (pos + 6 >= len) return null;
      return { width: v.getUint16(pos + 5), height: v.getUint16(pos + 3) };
    }
    const segLen = v.getUint16(pos);
    if (segLen < 2) return null;
    pos += segLen;
  }
  return null;
}

function fourccAt(v: DataView, offset: number): string {
  return String.fromCharCode(
    v.getUint8(offset),
    v.getUint8(offset + 1),
    v.getUint8(offset + 2),
    v.getUint8(offset + 3),
  );
}

function readWebp(v: DataView): ImageDimensions | null {
  // RIFF(4) + size(4) + "WEBP"(4), then a variant chunk whose fourcc at
  // offset 12 selects the dimension layout.
  if (v.byteLength < 16) return null;
  const fourcc = fourccAt(v, 12);
  if (fourcc === "VP8X") {
    // flags(1) + reserved(3), then canvas (width-1)/(height-1) as LE u24.
    if (v.byteLength < 30) return null;
    const w = v.getUint16(24, true) | (v.getUint8(26) << 16);
    const h = v.getUint16(27, true) | (v.getUint8(29) << 16);
    return { width: w + 1, height: h + 1 };
  }
  if (fourcc === "VP8 ") {
    // frame tag(3) + start code 0x9d012a(3), then 14-bit width/height as LE u16.
    // Require the start code so a non-key-frame or corrupt chunk yields null
    // rather than a masked-but-meaningless number.
    if (
      v.byteLength < 30 ||
      v.getUint8(23) !== 0x9d ||
      v.getUint8(24) !== 0x01 ||
      v.getUint8(25) !== 0x2a
    ) {
      return null;
    }
    return {
      width: v.getUint16(26, true) & 0x3fff,
      height: v.getUint16(28, true) & 0x3fff,
    };
  }
  if (fourcc === "VP8L") {
    // 0x2f signature at 20, then 14-bit (width-1)/(height-1) bit-packed.
    if (v.byteLength < 25 || v.getUint8(20) !== 0x2f) return null;
    const bits = v.getUint32(21, true);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >>> 14) & 0x3fff) + 1,
    };
  }
  return null;
}

function readAvif(v: DataView): ImageDimensions | null {
  // ISOBMFF nests the ImageSpatialExtents box (`ispe`) several boxes deep;
  // scan for its fourcc rather than walking the box tree, then read the BE
  // u32 width/height that follow the 4-byte version/flags field. Require the
  // preceding u32 to be the fixed 20-byte box size (size(4) + type(4) +
  // version/flags(4) + w(4) + h(4)) so a stray `ispe` in some other box's
  // payload can't be mistaken for a real spatial-extents box.
  for (let i = 4; i + 16 <= v.byteLength; i++) {
    if (fourccAt(v, i) === "ispe" && v.getUint32(i - 4) === 0x14) {
      const width = v.getUint32(i + 8);
      const height = v.getUint32(i + 12);
      if (width > 0 && height > 0) return { width, height };
    }
  }
  return null;
}

export function readImageDimensions(
  bytes: Uint8Array,
  mime: string,
): ImageDimensions | null {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  switch (mime) {
    case "image/png":
      return readPng(v);
    case "image/gif":
      return readGif(v);
    case "image/jpeg":
      return readJpeg(v);
    case "image/webp":
      return readWebp(v);
    case "image/avif":
      return readAvif(v);
    default:
      return null;
  }
}
