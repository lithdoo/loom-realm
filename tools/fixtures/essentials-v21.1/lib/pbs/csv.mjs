import { fail } from "../errors.mjs";

export function splitPbsCsv(input, context = "PBS value") {
  const fields = [];
  let field = "";
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (escaped) {
      field += character;
      escaped = false;
    } else if (character === "\\" && quoted) {
      escaped = true;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      fields.push(field.trim());
      field = "";
    } else {
      field += character;
    }
  }
  if (escaped || quoted) fail("PBS_SYNTAX_FAILURE", `Unterminated quoted CSV field in ${context}`);
  fields.push(field.trim());
  return fields;
}
