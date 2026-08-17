function scalar(value) {
  if (value === undefined) return "null";
  if (typeof value === "bigint") return `{"$bigint":${JSON.stringify(value.toString())}}`;
  if (typeof value === "number" && !Number.isFinite(value)) return `{"$number":${JSON.stringify(String(value))}}`;
  return JSON.stringify(value);
}

function* jsonPieces(value, seen) {
  if (value === null || typeof value !== "object") {
    yield scalar(value);
    return;
  }
  const existing = seen.get(value);
  if (existing !== undefined) {
    yield `{"$ref":${existing}}`;
    return;
  }
  const id = seen.size + 1;
  seen.set(value, id);
  if (Buffer.isBuffer(value)) {
    yield `{"$id":${id},"$bytes":${JSON.stringify(value.toString("base64"))}}`;
    return;
  }
  if (ArrayBuffer.isView(value)) {
    yield `{"$id":${id},"$typed":${JSON.stringify(value.constructor.name)},"values":[`;
    for (let index = 0; index < value.length; index += 1) {
      if (index > 0) yield ",";
      yield scalar(value[index]);
    }
    yield "]}";
    return;
  }
  if (Array.isArray(value)) {
    yield `{"$id":${id},"$array":[`;
    for (let index = 0; index < value.length; index += 1) {
      if (index > 0) yield ",";
      yield* jsonPieces(value[index], seen);
    }
    yield "]}";
    return;
  }
  yield `{"$id":${id}`;
  for (const key of Object.keys(value).sort()) {
    yield `,${JSON.stringify(key)}:`;
    yield* jsonPieces(value[key], seen);
  }
  yield "}";
}

export async function* streamStructuredJson(value, chunkSize = 64 * 1024) {
  let pending = "";
  for (const piece of jsonPieces(value, new Map())) {
    pending += piece;
    if (Buffer.byteLength(pending, "utf8") >= chunkSize) {
      yield Buffer.from(pending, "utf8");
      pending = "";
    }
  }
  pending += "\n";
  if (pending) yield Buffer.from(pending, "utf8");
}

export function structuredObject(table, key, value, references = []) {
  return Object.freeze({
    table,
    key,
    relativeSegments: Object.freeze([`${key}.json`]),
    references: Object.freeze(references),
    open: () => streamStructuredJson(value),
  });
}
