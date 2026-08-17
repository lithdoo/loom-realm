export const OBJECT_SCHEMA = Object.freeze({ type: "object" });

export function schemaBytes(schema = OBJECT_SCHEMA) {
  return Buffer.from(`${JSON.stringify(schema)}\n`, "utf8");
}
