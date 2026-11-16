import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

async function writeStruct(database, body) {
  const table = join(database, "[STRUCT]Config");
  await mkdir(table, { recursive: true });
  await writeFile(join(table, ".info.meta"), "{\"type\":\"object\"}");
  await writeFile(join(table, "common.json"), body);
}

async function writeGroup(database, body) {
  const table = join(database, "[GROUP]Party");
  await mkdir(table, { recursive: true });
  await writeFile(join(table, ".info.meta"), "{\"type\":\"object\"}");
  await writeFile(join(table, ".desc.meta"), "party");
  await writeFile(join(table, "common.jsonl"), body);
}

async function writeResource(database, body) {
  const table = join(database, "[RESOURCE]Assets");
  await mkdir(table, { recursive: true });
  await writeFile(join(table, ".desc.meta"), "assets");
  await writeFile(join(table, "logo.txt"), body);
}

/** One source tree for the Desktop and PWA Content parity gate. */
export async function writeContentParityFixture(root) {
  await writeStruct(join(root, "[FSDB]GameData"), "{\"owner\":\"parent\"}");
  await writeGroup(join(root, "[FSDB]GameData"), "{\"member\":\"a\"}\n{\"member\":\"b\"}\n");
  await writeResource(join(root, "[FSDB]GameData"), "shared-logo");
  await writeStruct(join(root, "[FSDB]GameData", "[FSDB]World"), "{\"owner\":\"world\"}");
  await writeStruct(join(root, "[FSDB]ModData"), "{\"owner\":\"mod\"}");
  await writeResource(join(root, "[FSDB]ModData"), "shared-logo");
  await mkdir(join(root, "[FSDB]Empty"));
  const hidden = join(root, "[FSDB]GameData", "[RESOURCE]NotADatabase", "[FSDB]Something");
  await mkdir(hidden, { recursive: true });
  await writeFile(join(root, "[FSDB]GameData", "[RESOURCE]NotADatabase", ".desc.meta"), "hidden");
  await writeFile(join(hidden, "ordinary.txt"), "not-a-database");
}
