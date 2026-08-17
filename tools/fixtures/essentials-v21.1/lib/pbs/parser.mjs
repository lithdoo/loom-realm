import { fail } from "../errors.mjs";
import { castPbsRecord } from "./cast.mjs";
import { lexPbs } from "./lexer.mjs";
import { provenance, withProvenance } from "./provenance.mjs";

export function parsePbs(bytes, options = {}) {
  const file = options.file ?? "<memory>";
  const schema = options.schema ?? {};
  const document = lexPbs(bytes, file);
  const sections = [];
  let current = null;
  const discardedProperties = 0;
  for (const token of document.tokens) {
    if (token.kind === "section") {
      current = { id: token.name, source: provenance(file, token.source.line, token.name), properties: {}, unknownProperties: [] };
      sections.push(current);
      continue;
    }
    if (current === null) fail("PBS_SYNTAX_FAILURE", `Expected a section before ${token.name} in ${file}:${token.source.line}`);
    const definition = schema[token.name];
    const source = provenance(file, token.source.line, current.id, token.name, token.value);
    if (definition === undefined) {
      current.unknownProperties.push(Object.freeze({ name: token.name, value: token.value, source }));
      continue;
    }
    const format = definition.format;
    const value = castPbsRecord(token.value, format, definition.enumerations ?? [], `${file}:${token.source.line} ${current.id}.${token.name}`);
    const compiled = withProvenance(value, source);
    if (format.startsWith("^")) {
      current.properties[definition.field] ??= [];
      current.properties[definition.field].push(compiled);
    } else {
      current.properties[definition.field] = compiled;
    }
  }
  for (const section of sections) {
    for (const [key, value] of Object.entries(section.properties)) {
      if (Array.isArray(value)) Object.freeze(value);
      Object.freeze(value);
      void key;
    }
    Object.freeze(section.properties);
    Object.freeze(section.unknownProperties);
    Object.freeze(section);
  }
  return Object.freeze({
    file,
    raw: document.raw,
    sections: Object.freeze(sections),
    coverage: Object.freeze({ parsedProperties: document.tokens.filter((token) => token.kind === "property").length, discardedProperties }),
  });
}
