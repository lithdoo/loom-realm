import { decodeColor, decodeTable, decodeTone } from "./binary.mjs";
import { RMXP_CLASS_REGISTRY } from "./class-registry.mjs";

export function decodeRmxpGraph(graph, registry = RMXP_CLASS_REGISTRY) {
  const memo = new Map();
  const encounteredClasses = new Map();
  const genericClasses = new Map();
  let eventCommands = 0;

  function convert(value) {
    if (value === null || typeof value !== "object") return value;
    if (memo.has(value)) return memo.get(value);
    if (value.kind === "symbol") return Object.freeze({ kind: "RubySymbol", name: value.name });
    if (value.kind === "string") return Object.freeze({ kind: "RubyString", bytes: value.bytes, text: value.text, ivars: value.ivars });
    if (value.kind === "array") {
      const output = { kind: "Array", items: [], rubyObjectId: value.objectId };
      memo.set(value, output);
      output.items.push(...value.items.map(convert));
      return output;
    }
    if (value.kind === "hash") {
      const output = { kind: "Hash", entries: [], hasDefault: value.hasDefault, defaultValue: null, rubyObjectId: value.objectId };
      memo.set(value, output);
      output.entries.push(...value.entries.map(([key, item]) => Object.freeze([convert(key), convert(item)])));
      output.defaultValue = convert(value.defaultValue);
      return output;
    }
    if (value.kind === "user-defined" && value.className === "Table") {
      const output = { kind: "Table", ...decodeTable(value.payload), rubyObjectId: value.objectId, ivars: value.ivars };
      memo.set(value, output);
      return output;
    }
    if (value.kind === "user-defined" && value.className === "Color") {
      const output = { kind: "Color", ...decodeColor(value.payload), rubyObjectId: value.objectId, ivars: value.ivars };
      memo.set(value, output);
      return output;
    }
    if (value.kind === "user-defined" && value.className === "Tone") {
      const output = { kind: "Tone", ...decodeTone(value.payload), rubyObjectId: value.objectId, ivars: value.ivars };
      memo.set(value, output);
      return output;
    }
    if (value.kind === "object") {
      encounteredClasses.set(value.className, (encounteredClasses.get(value.className) ?? 0) + 1);
      const definition = registry.get(value.className);
      if (definition) {
        const output = { kind: "RmxpObject", className: value.className, fields: Object.create(null), extraIvars: Object.create(null), rubyObjectId: value.objectId };
        memo.set(value, output);
        const known = new Set(definition.fields);
        for (const [name, child] of Object.entries(value.ivars)) (known.has(name) ? output.fields : output.extraIvars)[name] = convert(child);
        if (value.className === "RPG::EventCommand") eventCommands += 1;
        return output;
      }
      genericClasses.set(value.className, (genericClasses.get(value.className) ?? 0) + 1);
      const output = { kind: "GenericRubyObject", className: value.className, ivars: Object.create(null), rubyObjectId: value.objectId };
      memo.set(value, output);
      for (const [name, child] of Object.entries(value.ivars)) output.ivars[name] = convert(child);
      return output;
    }
    const output = { kind: "GenericMarshalNode", marshalKind: value.kind, rubyObjectId: value.objectId };
    memo.set(value, output);
    for (const [name, child] of Object.entries(value)) {
      if (["kind", "objectId"].includes(name)) continue;
      output[name] = Buffer.isBuffer(child) || ArrayBuffer.isView(child) ? child : convert(child);
    }
    return output;
  }

  const root = convert(graph.root);
  return Object.freeze({
    root,
    coverage: Object.freeze({
      encounteredClasses: Object.freeze(Object.fromEntries([...encounteredClasses].sort())),
      genericUnknownClasses: Object.freeze(Object.fromEntries([...genericClasses].sort())),
      discardedIvars: 0,
      discardedEventCommands: 0,
      eventCommands,
    }),
  });
}
