import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { prepareWebPresentationV1 } from "../../../packages/renderer/dist/internal/web-presentation-config.js";

const root = new URL("../", import.meta.url);
const version = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

export async function prepareExamplePresentation(origin) {
  const candidate = JSON.parse(await readFile(new URL("presentation.json", root), "utf8"));
  const artifacts = new Map();
  const add = (namespace, key, bytes, mime, browserPath) => {
    artifacts.set(`${namespace}/${key}`, { bytes, mime, contentVersion: version(bytes), browserPath });
  };
  add("Presentation", "map/map.css", await readFile(fileURLToPath(import.meta.resolve("@loomrealm-game/map/browser/map.css"))), "text/css", "/presentation/map/map.css");
  add("Presentation", "map/map.browser.js", await readFile(fileURLToPath(import.meta.resolve("@loomrealm-game/map/browser/map.browser.js"))), "text/javascript", "/presentation/map/map.browser.js");
  add("Presentation", "essentials/page.css", await readFile(new URL("presentation.css", root)), "text/css", "/presentation/essentials/page.css");
  const prepared = await prepareWebPresentationV1(candidate, async (ref) => {
    const artifact = artifacts.get(`${ref.namespace}/${ref.key}`);
    if (!artifact) throw new Error(`Missing prepared presentation artifact ${ref.namespace}/${ref.key}`);
    return { contentVersion: artifact.contentVersion, mime: artifact.mime, browserSource: `${origin}${artifact.browserPath}` };
  });
  return { candidate, prepared, artifacts };
}
