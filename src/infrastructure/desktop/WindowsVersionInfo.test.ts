import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync("scripts/windows-version-info.mjs", "utf8").replace("export function", "function");
const fix = runInNewContext(source + "; fixVersionStringLengths", { Buffer });

it("repairs the missing terminator length without moving the next resource", () => {
  const binary = Buffer.alloc(52);
  binary.writeUInt16LE(46, 0); binary.writeUInt16LE(7, 2); binary.writeUInt16LE(1, 4);
  binary.write("ProductName\0", 6, "utf16le"); binary.write("Grungus\0", 32, "utf16le");
  binary.writeUInt32LE(0x12345678, 48);
  fix(binary, { ProductName: "Grungus" });
  expect(binary.readUInt16LE(2)).toBe(8);
  expect(binary.readUInt16LE(0)).toBe(48);
  expect(binary.subarray(32, 46).toString("utf16le")).toBe("Grungus");
  expect(binary.readUInt32LE(48)).toBe(0x12345678);
  const repaired = Buffer.from(binary);
  fix(binary, { ProductName: "Grungus" });
  expect(binary).toEqual(repaired);
});

it("rejects a missing or unexpected resource rather than branding silently", () => {
  expect(() => fix(Buffer.alloc(64), { ProductName: "Grungus" })).toThrow("Missing version resource");
});
