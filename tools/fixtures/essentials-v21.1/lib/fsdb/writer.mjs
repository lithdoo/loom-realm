import { lstat, mkdir, open, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fail } from "../errors.mjs";
import { fingerprint, sameFingerprint } from "../source/fingerprint.mjs";

async function copyPlannedFile(resource, target) {
  const before = await lstat(resource.sourcePath);
  if (!before.isFile() || before.isSymbolicLink() || !sameFingerprint(resource.fingerprint, fingerprint(before))) {
    fail("COPY_FAILURE", `Source changed after preflight: ${resource.table}/${resource.sourceRelativeSegments.join("/")}`);
  }
  const source = await open(resource.sourcePath, "r");
  let destination;
  try {
    const opened = await source.stat();
    if (!sameFingerprint(resource.fingerprint, fingerprint(opened))) fail("COPY_FAILURE", "Source changed while opening");
    destination = await open(target, "wx");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let position = 0;
    while (true) {
      const { bytesRead } = await source.read(buffer, 0, buffer.length, position);
      if (bytesRead === 0) break;
      let written = 0;
      while (written < bytesRead) {
        const result = await destination.write(buffer, written, bytesRead - written, position + written);
        written += result.bytesWritten;
      }
      position += bytesRead;
    }
    const after = await source.stat();
    if (!sameFingerprint(resource.fingerprint, fingerprint(after))) fail("COPY_FAILURE", "Source changed while copying");
    if (BigInt(position) !== resource.size) fail("COPY_FAILURE", "Copied byte count differs from preflight");
  } finally {
    if (destination) await destination.close();
    await source.close();
  }
}

async function writeProducedFile(object, target) {
  const destination = await open(target, "wx");
  try {
    let position = 0;
    for await (const chunkInput of object.open()) {
      const chunk = Buffer.isBuffer(chunkInput) ? chunkInput : Buffer.from(chunkInput);
      let written = 0;
      while (written < chunk.length) {
        const result = await destination.write(chunk, written, chunk.length - written, position + written);
        written += result.bytesWritten;
      }
      position += chunk.length;
    }
  } finally {
    await destination.close();
  }
}

export async function materializeRawFixture(stagingPath, plan, acquisitionMode) {
  for (const table of plan.tables) {
    const target = join(stagingPath, `[resource]${table}`);
    await mkdir(target);
    await writeFile(
      join(target, ".desc.meta"),
      `Imported from Pokémon Essentials v21.1 \`${table}/\`.\n\nGenerated for local LoomRealm FSDB integration testing.\nSource assets are not owned or redistributed by LoomRealm.\n`,
      { encoding: "utf8", flag: "wx" },
    );
  }
  for (const directory of plan.directories) {
    await mkdir(join(stagingPath, `[resource]${directory.table}`, ...directory.segments), { recursive: true });
  }
  for (const resource of plan.resources) {
    const target = join(stagingPath, `[resource]${resource.table}`, ...resource.relativeSegments);
    await copyPlannedFile(resource, target);
  }
  for (const table of plan.structured.tables) {
    const target = join(stagingPath, `[${table.kind}]${table.name}`);
    await mkdir(target);
    await writeFile(join(target, ".info.meta"), `${JSON.stringify(table.schema)}\n`, { encoding: "utf8", flag: "wx" });
  }
  for (const object of plan.structured.objects) {
    const target = join(stagingPath, `[struct]${object.table}`, ...object.relativeSegments);
    await writeProducedFile(object, target);
  }
  const info = join(stagingPath, "[struct]测试信息");
  await mkdir(info);
  await writeFile(join(info, ".info.meta"), '{"type":"object"}\n', { encoding: "utf8", flag: "wx" });
  await writeFile(
    join(info, "来源.json"),
    `${JSON.stringify({ name: "Pokémon Essentials", version: "21.1", purpose: "local fsdb-http integration fixture", acquisition: acquisitionMode }, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" },
  );
}
