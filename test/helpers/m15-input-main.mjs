import { readFile } from "node:fs/promises";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow } from "electron";

const inputSource = new URL("../../apps/desktop/dist/renderer-input-source.js", import.meta.url);
const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%}#surface{position:fixed;inset:0}</style><body><div id="surface"></div><script type="module">
let pads=[];
Object.defineProperty(navigator,"getGamepads",{configurable:true,value:()=>pads});
const {createDesktopRendererInputSource}=await import("/input.js");
const changes=[];
const source=createDesktopRendererInputSource(window);
let stop;
globalThis.__m15Input={
  changes,
  start(){stop=source.start(change=>changes.push(structuredClone(change)))},
  setPad(value){pads=value===null?[]:[{index:0,connected:true,mapping:"standard",axes:[0,0,0,0],buttons:Array.from({length:17},(_,index)=>({value:index===0?value:0}))}]},
  setLifecycle(visibilityState,focused){Object.defineProperty(document,"visibilityState",{configurable:true,value:visibilityState}); document.hasFocus=()=>focused; dispatchEvent(new Event(focused?"focus":"blur")); document.dispatchEvent(new Event("visibilitychange"))},
  stop(){stop?.();},
};
document.documentElement.dataset.ready="true";
</script>`;

const server = http.createServer(async (request, response) => {
  if (request.url === "/") { response.setHeader("content-type", "text/html; charset=utf-8"); response.end(html); return; }
  if (request.url === "/input.js") { response.setHeader("content-type", "text/javascript; charset=utf-8"); response.end(await readFile(fileURLToPath(inputSource))); return; }
  response.statusCode = 404; response.end();
});
await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
const port = server.address().port;
let window;
void app.whenReady().then(async () => {
  window = new BrowserWindow({ width: 320, height: 240, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.on("closed", () => app.quit());
  await window.loadURL(`http://127.0.0.1:${port}/`);
}).catch(() => app.quit());
app.on("before-quit", () => { server.closeAllConnections(); server.close(); });
