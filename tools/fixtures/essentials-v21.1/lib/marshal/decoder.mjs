import { fail } from "../errors.mjs";
import { ByteReader } from "./reader.mjs";
import { decodeRubyBytes, graphStats, marshalNode } from "./graph.mjs";

const TAG_NAMES = Object.freeze({
  48: "nil", 84: "true", 70: "false", 105: "fixnum", 108: "bignum", 102: "float",
  58: "symbol", 59: "symbol-link", 34: "string", 47: "regexp", 91: "array", 123: "hash",
  125: "hash-default", 83: "struct", 111: "object", 64: "object-link", 73: "ivars",
  67: "user-class", 117: "user-defined", 85: "user-marshal", 101: "extended",
  99: "class", 109: "module", 77: "class-or-module", 100: "data",
});

export function decodeMarshal(input, options = {}) {
  const reader = new ByteReader(input, options.source);
  if (reader.byte() !== 4 || reader.byte() !== 8) fail("MARSHAL_INVALID", `Unsupported Ruby Marshal version in ${reader.source}`);
  const objects = [];
  const symbols = [];
  const tagCounts = Object.create(null);
  let nodes = 0;

  const count = (tag) => { const name = TAG_NAMES[tag] ?? `0x${tag.toString(16)}`; tagCounts[name] = (tagCounts[name] ?? 0) + 1; };
  const register = (node) => {
    node.objectId = objects.length;
    objects.push(node);
    nodes += 1;
    return node;
  };
  const symbolName = (value) => {
    if (!value || value.kind !== "symbol") fail("MARSHAL_INVALID", `Expected symbol at ${reader.source}:${reader.offset}`);
    return value.name;
  };
  const readSymbol = () => symbolName(readValue());
  const readPairs = (target, length) => {
    for (let index = 0; index < length; index += 1) target[readSymbol()] = readValue();
  };

  function readValue() {
    const tag = reader.byte();
    count(tag);
    switch (tag) {
      case 48: return null;
      case 84: return true;
      case 70: return false;
      case 105: return reader.fixnum();
      case 58: {
        const bytes = Buffer.from(reader.sizedBytes());
        const name = decodeRubyBytes(bytes);
        if (name === null) fail("MARSHAL_INVALID", `Non-UTF-8 Ruby symbol in ${reader.source}`);
        const node = marshalNode("symbol", { name, bytes, symbolId: symbols.length });
        symbols.push(node);
        nodes += 1;
        return node;
      }
      case 59: {
        const index = reader.fixnum();
        if (index < 0 || index >= symbols.length) fail("MARSHAL_INVALID", `Invalid Ruby symbol link ${index} in ${reader.source}`);
        return symbols[index];
      }
      case 64: {
        const index = reader.fixnum();
        if (index < 0 || index >= objects.length) fail("MARSHAL_INVALID", `Invalid Ruby object link ${index} in ${reader.source}`);
        return objects[index];
      }
      case 34: {
        const bytes = Buffer.from(reader.sizedBytes());
        return register(marshalNode("string", { bytes, text: decodeRubyBytes(bytes) }));
      }
      case 91: {
        const length = reader.fixnum();
        if (length < 0) fail("MARSHAL_INVALID", `Negative array length in ${reader.source}`);
        const node = register(marshalNode("array", { items: [] }));
        for (let index = 0; index < length; index += 1) node.items.push(readValue());
        return node;
      }
      case 123:
      case 125: {
        const length = reader.fixnum();
        if (length < 0) fail("MARSHAL_INVALID", `Negative hash length in ${reader.source}`);
        const node = register(marshalNode("hash", { entries: [], defaultValue: null, hasDefault: tag === 125 }));
        for (let index = 0; index < length; index += 1) node.entries.push(Object.freeze([readValue(), readValue()]));
        if (tag === 125) node.defaultValue = readValue();
        return node;
      }
      case 111: {
        const className = readSymbol();
        const node = register(marshalNode("object", { className }));
        const length = reader.fixnum();
        if (length < 0) fail("MARSHAL_INVALID", `Negative ivar count in ${reader.source}`);
        readPairs(node.ivars, length);
        return node;
      }
      case 83: {
        const className = readSymbol();
        const node = register(marshalNode("struct", { className, members: Object.create(null) }));
        const length = reader.fixnum();
        if (length < 0) fail("MARSHAL_INVALID", `Negative struct member count in ${reader.source}`);
        readPairs(node.members, length);
        return node;
      }
      case 73: {
        const value = readValue();
        const length = reader.fixnum();
        if (length < 0) fail("MARSHAL_INVALID", `Negative ivar count in ${reader.source}`);
        const ivars = value && typeof value === "object" ? (value.ivars ??= Object.create(null)) : Object.create(null);
        readPairs(ivars, length);
        if (value && typeof value === "object") return value;
        return register(marshalNode("boxed", { value, ivars }));
      }
      case 47: {
        const bytes = Buffer.from(reader.sizedBytes());
        const optionsByte = reader.byte();
        return register(marshalNode("regexp", { bytes, text: decodeRubyBytes(bytes), options: optionsByte }));
      }
      case 102: {
        const bytes = reader.sizedBytes();
        const text = bytes.toString("ascii");
        let value;
        if (text === "nan") value = Number.NaN;
        else if (text === "inf") value = Number.POSITIVE_INFINITY;
        else if (text === "-inf") value = Number.NEGATIVE_INFINITY;
        else value = Number.parseFloat(text);
        if (Number.isNaN(value) && text !== "nan") fail("MARSHAL_INVALID", `Invalid float '${text}' in ${reader.source}`);
        return register(marshalNode("float", { value, sourceText: text }));
      }
      case 108: {
        const sign = String.fromCharCode(reader.byte());
        if (sign !== "+" && sign !== "-") fail("MARSHAL_INVALID", `Invalid bignum sign in ${reader.source}`);
        const words = reader.fixnum();
        if (words < 0) fail("MARSHAL_INVALID", `Negative bignum length in ${reader.source}`);
        const bytes = Buffer.from(reader.take(words * 2));
        let magnitude = 0n;
        for (let index = bytes.length - 1; index >= 0; index -= 1) magnitude = (magnitude << 8n) | BigInt(bytes[index]);
        return register(marshalNode("bignum", { value: sign === "-" ? -magnitude : magnitude, bytes }));
      }
      case 117: {
        const className = readSymbol();
        const payload = Buffer.from(reader.sizedBytes());
        return register(marshalNode("user-defined", { className, payload }));
      }
      case 85:
      case 100: {
        const className = readSymbol();
        const node = register(marshalNode(tag === 85 ? "user-marshal" : "data", { className, value: null }));
        node.value = readValue();
        return node;
      }
      case 67: {
        const className = readSymbol();
        const value = readValue();
        if (value && typeof value === "object") value.userClass = className;
        return value;
      }
      case 101: {
        const moduleName = readSymbol();
        const value = readValue();
        if (value && typeof value === "object") value.extensions.push(moduleName);
        return value;
      }
      case 99:
      case 109:
      case 77: {
        const bytes = Buffer.from(reader.sizedBytes());
        const name = decodeRubyBytes(bytes);
        if (name === null) fail("MARSHAL_INVALID", `Non-UTF-8 class/module name in ${reader.source}`);
        return register(marshalNode(tag === 99 ? "class-ref" : tag === 109 ? "module-ref" : "class-or-module-ref", { name, bytes }));
      }
      default:
        fail("MARSHAL_UNSUPPORTED", `Unsupported Ruby Marshal tag 0x${tag.toString(16).padStart(2, "0")} at ${reader.source}:${reader.offset - 1}`);
    }
  }

  const root = readValue();
  if (reader.offset !== reader.bytes.length) fail("MARSHAL_INVALID", `Trailing bytes in ${reader.source}: ${reader.bytes.length - reader.offset}`);
  return Object.freeze({
    version: "4.8",
    source: reader.source,
    root,
    objects: Object.freeze(objects),
    symbols: Object.freeze(symbols),
    coverage: graphStats(root, Object.freeze({ nodes, objectCount: objects.length, symbolCount: symbols.length, tagCounts: Object.freeze(tagCounts) })),
  });
}
