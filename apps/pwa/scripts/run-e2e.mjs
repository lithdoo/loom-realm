import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const mode = process.argv[2] ?? "all";
if (!new Set(["m16", "m17", "all"]).has(mode)) throw new Error("Invalid PWA E2E mode");
const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const mime = new Map([[".html", "text/html; charset=utf-8"], [".js", "text/javascript; charset=utf-8"], [".json", "application/json; charset=utf-8"]]);

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const requested = url.pathname === "/" || !extname(url.pathname) ? "index.html" : url.pathname.slice(1);
  const file = normalize(join(dist, requested));
  if (!file.startsWith(normalize(dist))) { response.writeHead(403).end(); return; }
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error();
    response.writeHead(200, {
      "Content-Type": mime.get(extname(file)) ?? "application/octet-stream",
      "Content-Length": info.size,
      "Cache-Control": requested === "service-worker.js" ? "no-store" : "no-cache",
      "Service-Worker-Allowed": "/",
    });
    if (request.method === "HEAD") response.end(); else createReadStream(file).pipe(response);
  } catch { response.writeHead(404, { "Content-Type": "text/plain" }).end("Not Found"); }
});
await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
const address = server.address();
if (address === null || typeof address === "string") throw new Error("PWA test server unavailable");
const patterns = process.env.LOOMREALM_PWA_TEST_FILE ? [process.env.LOOMREALM_PWA_TEST_FILE] : mode === "m16"
  ? ["test/m16-runtime.e2e.test.mjs", "test/installation-content.e2e.test.mjs"]
  : mode === "m17"
    ? ["test/m16-runtime.e2e.test.mjs", "test/installation-content.e2e.test.mjs", "test/lifecycle.e2e.test.mjs", "test/m17-product.e2e.test.mjs"]
    : ["test/m16-runtime.e2e.test.mjs", "test/installation-content.e2e.test.mjs", "test/lifecycle.e2e.test.mjs", "test/m17-product.e2e.test.mjs"];
const child = spawn(process.execPath, ["--test", "--test-concurrency=1", ...patterns], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, LOOMREALM_PWA_URL: `http://127.0.0.1:${address.port}/` },
  shell: false,
});
const exitCode = await new Promise((resolve) => child.once("exit", (code) => resolve(code ?? 1)));
await new Promise((resolve) => server.close(resolve));
process.exitCode = exitCode;
