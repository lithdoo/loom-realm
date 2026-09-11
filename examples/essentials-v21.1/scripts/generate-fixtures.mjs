import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";

const output = new URL("../fixtures/", import.meta.url);
await mkdir(new URL("resources/", output), { recursive: true });

let crcTable;
function crc32(bytes) {
  crcTable ??= Array.from({ length: 256 }, (_, n) => {
    let value = n;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
  });
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(name, data) {
  const type = Buffer.from(name, "ascii");
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([type, data])));
  return Buffer.concat([length, type, data, checksum]);
}

function png(width, height, pixel) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1); raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const color = pixel(x, y); const offset = row + 1 + x * 4;
      raw[offset] = color[0]; raw[offset + 1] = color[1]; raw[offset + 2] = color[2]; raw[offset + 3] = color[3];
    }
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const mapValues = Array(24 * 18 * 3).fill(0);
for (let y = 0; y < 18; y += 1) for (let x = 0; x < 24; x += 1) mapValues[x + y * 24] = 384;
mapValues[12 + 8 * 24] = 385;
const passages = Array(386).fill(0); passages[385] = 0x02;
const priorities = Array(386).fill(0); priorities[0] = 5;
const table = (dimensions, xSize, ySize, zSize, values) => ({ dimensions, xSize, ySize, zSize, values });
const fixture = {
  records: {
    "struct.Map/1": { tileset_id: 1, width: 24, height: 18, data: table(3, 24, 18, 3, mapValues) },
    "struct.Tileset/1": { id: 1, tileset_name: "m14_tileset", passages: table(1, 386, 1, 1, passages), priorities: table(1, 386, 1, 1, priorities) }
  },
  expectedPixels: { tile384: [220, 40, 40, 255], tile385: [40, 80, 220, 255], playerDown: [240, 160, 30, 255], playerRight: [30, 110, 240, 255] }
};
await writeFile(new URL("semantic-content.json", output), `${JSON.stringify(fixture, null, 2)}\n`);
await writeFile(new URL("resources/m14_tileset.png", output), png(256, 32, (x, y) => x < 32 ? [220, 40, 40, 255] : x < 64 ? [40, 80, 220, 255] : ((x + y) % 2 ? [80, 80, 80, 255] : [120, 120, 120, 255])));
const rows = [[240, 160, 30, 255], [40, 190, 80, 255], [30, 110, 240, 255], [230, 210, 30, 255]];
await writeFile(new URL("resources/m14_player.png", output), png(128, 128, (x, y) => {
  const base = rows[Math.floor(y / 32)];
  const edge = x % 32 < 3 || x % 32 > 28 || y % 32 < 3 || y % 32 > 28;
  return edge ? [20, 20, 20, 255] : base;
}));

const installation = new URL("../", import.meta.url);
const fsdb = new URL("../[FSDB]essentials-v21.1/", import.meta.url);
await rm(fsdb, { recursive: true, force: true });
const directories = [
  "[struct]Map/",
  "[struct]Tileset/",
  "[resource]Graphics/Tilesets/",
  "[resource]Graphics/Characters/",
  "[resource]Presentation/map/",
  "[resource]Presentation/essentials/",
];
await Promise.all(directories.map((directory) => mkdir(new URL(directory, fsdb), { recursive: true })));
await Promise.all([
  writeFile(new URL("[struct]Map/.info.meta", fsdb), "{}\n"),
  writeFile(new URL("[struct]Map/1.json", fsdb), `${JSON.stringify(fixture.records["struct.Map/1"])}\n`),
  writeFile(new URL("[struct]Tileset/.info.meta", fsdb), "{}\n"),
  writeFile(new URL("[struct]Tileset/1.json", fsdb), `${JSON.stringify(fixture.records["struct.Tileset/1"])}\n`),
  writeFile(new URL("[resource]Graphics/.desc.meta", fsdb), "M15 canonical game resources.\n"),
  writeFile(new URL("[resource]Graphics/Tilesets/m14_tileset.png", fsdb), await readFile(new URL("resources/m14_tileset.png", output))),
  writeFile(new URL("[resource]Graphics/Characters/m14_player.png", fsdb), await readFile(new URL("resources/m14_player.png", output))),
  writeFile(new URL("[resource]Presentation/.desc.meta", fsdb), "M15 trusted presentation resources.\n"),
  writeFile(new URL("[resource]Presentation/map/map.css.css", fsdb), await readFile(new URL("../../game-libs/map/browser/map.css", installation))),
  writeFile(new URL("[resource]Presentation/map/map.browser.js.js", fsdb), await readFile(new URL("../../game-libs/map/browser/map.browser.js", installation))),
  writeFile(new URL("[resource]Presentation/essentials/page.css.css", fsdb), await readFile(new URL("presentation.css", installation))),
]);
