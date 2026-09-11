import { app } from "electron";
import { startDesktopProduct } from "./product-composition.js";

let product: Awaited<ReturnType<typeof startDesktopProduct>> | null = null;
let quitting = false;

app.on("before-quit", (event) => {
  if (quitting || product === null) return;
  event.preventDefault();
  quitting = true;
  void product.close().then(() => app.quit(), () => { process.exitCode = 1; app.quit(); });
});

void app.whenReady().then(async () => {
  const installationRoot = process.env.LOOMREALM_DESKTOP_INSTALLATION_ROOT;
  product = await startDesktopProduct(app, installationRoot === undefined ? {} : { installationRoot });
}).catch((cause) => {
  process.stderr.write(`Desktop startup failed: ${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}\n`);
  process.exitCode = 1;
  app.quit();
});
