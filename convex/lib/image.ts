import { ConvexError } from "convex/values";

type ImageDimensions = {
  width: number;
  height: number;
};

function isLikelyImageContentType(contentType: string | null) {
  if (!contentType) return false;
  return contentType.toLowerCase().startsWith("image/");
}

function parsePngDimensions(bytes: Uint8Array): ImageDimensions | null {
  const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < pngSignature.length; i += 1) {
    if (bytes[i] !== pngSignature[i]) return null;
  }
  if (bytes.length < 24) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    width: view.getUint32(16, false),
    height: view.getUint32(20, false),
  };
}

function parseGifDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 10) return null;
  const header = String.fromCharCode(...bytes.slice(0, 6));
  if (header !== "GIF87a" && header !== "GIF89a") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    width: view.getUint16(6, true),
    height: view.getUint16(8, true),
  };
}

function parseJpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    offset += 2;

    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 1 >= bytes.length) return null;

    const blockLength = (bytes[offset] << 8) + bytes[offset + 1];
    if (blockLength < 2 || offset + blockLength > bytes.length) return null;

    const isSofMarker =
      marker === 0xc0 ||
      marker === 0xc1 ||
      marker === 0xc2 ||
      marker === 0xc3 ||
      marker === 0xc5 ||
      marker === 0xc6 ||
      marker === 0xc7 ||
      marker === 0xc9 ||
      marker === 0xca ||
      marker === 0xcb ||
      marker === 0xcd ||
      marker === 0xce ||
      marker === 0xcf;

    if (isSofMarker) {
      if (offset + 7 >= bytes.length) return null;
      const height = (bytes[offset + 3] << 8) + bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) + bytes[offset + 6];
      return { width, height };
    }

    offset += blockLength;
  }

  return null;
}

function parseWebpDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 30) return null;
  const riff = String.fromCharCode(...bytes.slice(0, 4));
  const webp = String.fromCharCode(...bytes.slice(8, 12));
  if (riff !== "RIFF" || webp !== "WEBP") return null;

  const chunk = String.fromCharCode(...bytes.slice(12, 16));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (chunk === "VP8X") {
    const widthMinusOne =
      bytes[24] | (bytes[25] << 8) | (bytes[26] << 16);
    const heightMinusOne =
      bytes[27] | (bytes[28] << 8) | (bytes[29] << 16);
    return { width: widthMinusOne + 1, height: heightMinusOne + 1 };
  }

  if (chunk === "VP8 " && bytes.length >= 30) {
    const width = view.getUint16(26, true) & 0x3fff;
    const height = view.getUint16(28, true) & 0x3fff;
    return { width, height };
  }

  if (chunk === "VP8L" && bytes.length >= 25) {
    const b0 = bytes[21];
    const b1 = bytes[22];
    const b2 = bytes[23];
    const b3 = bytes[24];
    const width = 1 + (((b1 & 0x3f) << 8) | b0);
    const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    return { width, height };
  }

  return null;
}

function parseImageDimensions(bytes: Uint8Array): ImageDimensions | null {
  return (
    parsePngDimensions(bytes) ??
    parseGifDimensions(bytes) ??
    parseJpegDimensions(bytes) ??
    parseWebpDimensions(bytes)
  );
}

export async function assertValidSquareAvatarImage(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ConvexError("avatarPictureUrl must be a valid URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ConvexError("avatarPictureUrl must be an http(s) URL.");
  }

  const response = await fetch(parsed.toString(), {
    method: "GET",
    headers: {
      Range: "bytes=0-262143",
    },
  });

  if (!response.ok) {
    throw new ConvexError("avatarPictureUrl is not reachable.");
  }

  const contentType = response.headers.get("content-type");
  if (!isLikelyImageContentType(contentType)) {
    throw new ConvexError("avatarPictureUrl must point to an image.");
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const dimensions = parseImageDimensions(bytes);
  if (!dimensions) {
    throw new ConvexError("Could not read avatar image dimensions.");
  }
  if (dimensions.width <= 0 || dimensions.height <= 0) {
    throw new ConvexError("Avatar image dimensions are invalid.");
  }
  if (dimensions.width !== dimensions.height) {
    throw new ConvexError("Avatar image must be square.");
  }
}
