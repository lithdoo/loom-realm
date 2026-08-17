import { parsePbs } from "../../../pbs/parser.mjs";

export function schemaCast(sources, schema) {
  return Object.freeze(sources.map((source) => parsePbs(source.bytes, { file: source.file, schema })));
}
