const ascii = (bytes, start, length) =>
  String.fromCharCode(...bytes.slice(start, start + length));

const uint24le = (bytes, offset) =>
  bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);

export const webpDimensions = (buffer) => {
  const bytes = new Uint8Array(buffer);
  if (
    bytes.length < 30 ||
    ascii(bytes, 0, 4) !== "RIFF" ||
    ascii(bytes, 8, 4) !== "WEBP"
  ) {
    throw new Error("invalid-webp");
  }
  const type = ascii(bytes, 12, 4);
  if (type === "VP8X") {
    return {
      width: 1 + uint24le(bytes, 24),
      height: 1 + uint24le(bytes, 27),
    };
  }
  if (type === "VP8L") {
    if (bytes[20] !== 0x2f) throw new Error("invalid-webp");
    const bits =
      bytes[21] |
      (bytes[22] << 8) |
      (bytes[23] << 16) |
      (bytes[24] << 24);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >>> 14) & 0x3fff) + 1,
    };
  }
  if (type === "VP8 ") {
    for (let offset = 20; offset + 9 < bytes.length; offset += 1) {
      if (
        bytes[offset + 3] === 0x9d &&
        bytes[offset + 4] === 0x01 &&
        bytes[offset + 5] === 0x2a
      ) {
        return {
          width: (bytes[offset + 6] | (bytes[offset + 7] << 8)) & 0x3fff,
          height: (bytes[offset + 8] | (bytes[offset + 9] << 8)) & 0x3fff,
        };
      }
    }
  }
  throw new Error("unsupported-webp");
};

