import { fail } from "../errors.mjs";
import { splitPbsCsv } from "./csv.mjs";

const NAME = /^(?![0-9])\w+$/u;

function invalid(code, value, context) {
  fail("PBS_SCHEMA_FAILURE", `Invalid ${code} value '${value}' in ${context}`);
}

function enumValue(value, enumeration, optional, context) {
  if (value === "" && optional) return null;
  if (Array.isArray(enumeration)) {
    const index = enumeration.indexOf(value);
    if (index >= 0) return index;
  } else if (enumeration instanceof Map) {
    if (enumeration.has(value)) return enumeration.get(value);
  } else if (enumeration && typeof enumeration === "object") {
    if (Object.hasOwn(enumeration, value)) return enumeration[value];
  } else if (typeof enumeration === "function") {
    const resolved = enumeration(value);
    if (resolved !== undefined && resolved !== null) return resolved;
  }
  invalid("enum", value, context);
}

export function castPbsScalar(value, code, enumeration, context = "PBS value") {
  const optional = code === code.toUpperCase();
  const kind = code.toLowerCase();
  if (optional && value === "") return null;
  if (kind === "q" || kind === "s") return value;
  if (kind === "i") {
    if (!/^-?\d+$/u.test(value)) invalid("integer", value, context);
    return Number.parseInt(value, 10);
  }
  if (kind === "u" || kind === "v") {
    if (!/^\d+$/u.test(value) || (kind === "v" && Number(value) === 0)) invalid(kind === "v" ? "positive integer" : "unsigned integer", value, context);
    return Number.parseInt(value, 10);
  }
  if (kind === "x") {
    if (!/^[a-f\d]+$/iu.test(value)) invalid("hexadecimal", value, context);
    return Number.parseInt(value, 16);
  }
  if (kind === "f") {
    if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/u.test(value)) invalid("float", value, context);
    return Number.parseFloat(value);
  }
  if (kind === "b") {
    if (/^(?:1|true|yes|y)$/iu.test(value)) return true;
    if (/^(?:0|false|no|n)$/iu.test(value)) return false;
    invalid("boolean", value, context);
  }
  if (kind === "n" || kind === "m") {
    if (!NAME.test(value)) invalid(kind === "m" ? "symbol" : "name", value, context);
    return value;
  }
  if (kind === "e") return enumValue(value, enumeration, optional, context);
  if (kind === "y") {
    if (/^-?\d+$/u.test(value)) return Number.parseInt(value, 10);
    return enumValue(value, enumeration, optional, context);
  }
  fail("PBS_SCHEMA_FAILURE", `Unsupported PBS cast code '${code}' in ${context}`);
}

export function castPbsRecord(input, format, enumerations = [], context = "PBS value") {
  let mode = "single";
  let codes = format;
  if (format.startsWith("*")) { mode = "repeat"; codes = format.slice(1); }
  if (format.startsWith("^")) { mode = "property-repeat"; codes = format.slice(1); }
  if (codes === "") fail("PBS_SCHEMA_FAILURE", `Empty PBS schema format in ${context}`);
  if (codes.toLowerCase() === "q") return input;
  const values = splitPbsCsv(input, context);
  const groups = [];
  let index = 0;
  do {
    const group = codes.split("").map((code, codeIndex) => {
      const value = values[index] ?? "";
      index += 1;
      return castPbsScalar(value, code, enumerations[codeIndex], context);
    });
    groups.push(group);
  } while (mode === "repeat" && index < values.length);
  if (mode !== "repeat" && index < values.length) fail("PBS_SCHEMA_FAILURE", `Too many CSV fields in ${context}`);
  if (mode === "repeat") return codes.length === 1 ? groups.map((group) => group[0]) : groups;
  return codes.length === 1 ? groups[0][0] : groups[0];
}
