// rcedit omits the UTF-16 terminator from version-string lengths. Chromium's
// version reader subtracts that terminator and otherwise drops the final letter.
export function fixVersionStringLengths(binary, values) {
  for (const [key, value] of Object.entries(values)) {
    const encodedKey = Buffer.from(key + '\0', 'utf16le');
    const encodedValue = Buffer.from(value + '\0', 'utf16le');
    let found = false;
    let offset = -1;
    while ((offset = binary.indexOf(encodedKey, offset + 1)) !== -1) {
      if (offset < 6) continue;
      const block = offset - 6;
      const length = binary.readUInt16LE(block);
      const chars = binary.readUInt16LE(block + 2);
      const start = (offset + encodedKey.length + 3) & ~3;
      if (binary.readUInt16LE(block + 4) !== 1 ||
          start + encodedValue.length > ((block + length + 3) & ~3) ||
          block + length > binary.length ||
          !binary.subarray(start, start + encodedValue.length).equals(encodedValue)) continue;
      if (chars === value.length) {
        binary.writeUInt16LE(value.length + 1, block + 2);
        binary.writeUInt16LE(Math.max(length, start + encodedValue.length - block), block);
      }
      else if (chars !== value.length + 1) continue;
      found = true;
    }
    if (!found) throw new Error('Missing version resource: ' + key);
  }
  return binary;
}
