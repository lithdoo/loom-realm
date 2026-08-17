import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { connect } from "node:net";

export async function fixture() {
  const parent = await mkdtemp(join(tmpdir(), "fsdb-http-"));
  const root = join(parent, "[FSDB]游戏数据");
  const struct = join(root, "[struct]角色");
  const extend = join(root, "[extend]角色");
  const group = join(root, "[group]队伍");
  const resource = join(root, "[resource]图片");
  await Promise.all([mkdir(struct, { recursive: true }), mkdir(extend, { recursive: true }), mkdir(group, { recursive: true }), mkdir(join(resource, "关都地区"), { recursive: true })]);
  await Promise.all([
    writeFile(join(struct, ".info.meta"), "{\"type\":\"object\"}"),
    writeFile(join(struct, ".desc.meta"), "角色说明"),
    writeFile(join(struct, "皮卡丘.json"), "{\"name\":\"皮卡丘\"}"),
    writeFile(join(struct, "A+B.json"), "{\"plus\":true}"),
    writeFile(join(extend, ".info.meta"), "{\"type\":\"object\"}"),
    writeFile(join(extend, ".extend.meta"), "{\"field\":\"角色\",\"struct\":\"角色\"}\n"),
    writeFile(join(extend, "皮卡丘.json"), "{\"角色\":\"皮卡丘\"}"),
    writeFile(join(group, ".info.meta"), "{\"type\":\"object\"}"),
    writeFile(join(group, ".desc.meta"), "队伍说明"),
    writeFile(join(group, "主力.jsonl"), "{\"角色\":\"皮卡丘\"}\r\n\n"),
    writeFile(join(resource, ".desc.meta"), "图片说明"),
    writeFile(join(resource, "关都地区", "真新镇.png"), Buffer.from([0, 255, 1, 2])),
    writeFile(join(resource, "说明.txt"), Buffer.from([0xff, 0xfe, 0xfd])),
  ]);
  return { parent, root, struct, resource, async cleanup() { await rm(parent, { recursive: true, force: true }); } };
}

export async function request(origin, path, init = {}) {
  return fetch(new URL(path, origin), init);
}

export function rawRequest(port, target, method = "GET") {
  return new Promise((resolve, reject) => {
    const socket = connect(port, "127.0.0.1");
    let response = "";
    socket.setEncoding("latin1");
    socket.on("connect", () => socket.end(`${method} ${target} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`));
    socket.on("data", (chunk) => { response += chunk; });
    socket.on("end", () => resolve(response));
    socket.on("error", reject);
  });
}
