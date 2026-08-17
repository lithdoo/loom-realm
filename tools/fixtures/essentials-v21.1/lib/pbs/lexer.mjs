import { fail } from "../errors.mjs";
import { provenance } from "./provenance.mjs";

export function decodePbs(bytes, file = "<memory>") {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  let offset = 0;
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) offset = 3;
  const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(offset));
  if (text.includes("\u0000")) fail("PBS_SYNTAX_FAILURE", `NUL byte in ${file}`);
  return text;
}

export function lexPbs(bytes, file = "<memory>") {
  let text;
  try { text = decodePbs(bytes, file); } catch (error) {
    if (error?.category) throw error;
    fail("PBS_SYNTAX_FAILURE", `PBS file is not valid UTF-8: ${file}`);
  }
  const tokens = [];
  const lines = text.split(/\r\n|\n|\r/u);
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const prepared = raw.replace(/\s*#.*$/u, "").trim();
    if (prepared === "") continue;
    const source = provenance(file, index + 1, null, null, raw);
    const section = prepared.match(/^\[\s*(.*?)\s*\]$/u);
    if (section) {
      if (section[1] === "") fail("PBS_SYNTAX_FAILURE", `Empty section in ${file}:${index + 1}`);
      tokens.push(Object.freeze({ kind: "section", name: section[1], source }));
      continue;
    }
    const property = prepared.match(/^(\w+)\s*=\s*(.*)$/u);
    if (property) {
      tokens.push(Object.freeze({ kind: "property", name: property[1], value: property[2].trimEnd(), source }));
      continue;
    }
    fail("PBS_SYNTAX_FAILURE", `Bad PBS line syntax in ${file}:${index + 1}`, [raw]);
  }
  return Object.freeze({ file, raw: text, tokens: Object.freeze(tokens) });
}

export function lexPreppedLines(bytes, file = "<memory>") {
  let text;
  try { text = decodePbs(bytes, file); } catch (error) {
    if (error?.category) throw error;
    fail("PBS_SYNTAX_FAILURE", `PBS file is not valid UTF-8: ${file}`);
  }
  const lines = [];
  for (const [index, raw] of text.split(/\r\n|\n|\r/u).entries()) {
    const value = raw.replace(/\s*#.*$/u, "").trim();
    if (value !== "") lines.push(Object.freeze({ value, source: provenance(file, index + 1, null, null, raw) }));
  }
  return Object.freeze({ file, raw: text, lines: Object.freeze(lines) });
}
