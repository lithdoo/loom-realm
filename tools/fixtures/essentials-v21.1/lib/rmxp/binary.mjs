import { fail } from "../errors.mjs";

function ensure(payload, expected, className) {
  if (payload.length !== expected) fail("RMXP_DECODE_FAILURE", `Invalid ${className} payload size ${payload.length}, expected ${expected}`);
}

export function decodeTable(payload) {
  if (payload.length < 20) fail("RMXP_DECODE_FAILURE", `Invalid Table payload size ${payload.length}`);
  const dimensions = payload.readInt32LE(0);
  const xSize = payload.readInt32LE(4);
  const ySize = payload.readInt32LE(8);
  const zSize = payload.readInt32LE(12);
  const count = payload.readInt32LE(16);
  if (dimensions < 1 || dimensions > 3 || xSize < 0 || ySize < 0 || zSize < 0 || count < 0 || payload.length !== 20 + count * 2) {
    fail("RMXP_DECODE_FAILURE", "Invalid RGSS Table dimensions or payload length");
  }
  const values = new Int16Array(count);
  for (let index = 0; index < count; index += 1) values[index] = payload.readInt16LE(20 + index * 2);
  return Object.freeze({ dimensions, xSize, ySize, zSize, values });
}

export function decodeColor(payload) {
  ensure(payload, 32, "Color");
  return Object.freeze({ red: payload.readDoubleLE(0), green: payload.readDoubleLE(8), blue: payload.readDoubleLE(16), alpha: payload.readDoubleLE(24) });
}

export function decodeTone(payload) {
  ensure(payload, 32, "Tone");
  return Object.freeze({ red: payload.readDoubleLE(0), green: payload.readDoubleLE(8), blue: payload.readDoubleLE(16), gray: payload.readDoubleLE(24) });
}
