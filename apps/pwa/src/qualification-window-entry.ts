import { createDemoInstallationBundle } from "./installation-bundle.js";
import type { PwaInstallationBundleV1 } from "./installation-bundle.js";
import { inspectInstallationStorage, installPwaBundle, uninstallPwaInstallation } from "./installer.js";
import { startPwaProduct } from "./window-product.js";

interface PwaQualificationControl {
  inspectStorage(requiredBytes?: number): Promise<unknown>;
  uninstall(installationId?: string): Promise<void>;
  reinstall(): Promise<unknown>;
  install(bundle: PwaInstallationBundleV1, signal?: AbortSignal): Promise<unknown>;
  launch(installationId: string, presentation: unknown): Promise<void>;
  restart(): Promise<void>;
}

declare global {
  interface Window { __loomrealmPwaQualification: PwaQualificationControl }
}

const product = startPwaProduct();
const qualification: PwaQualificationControl = Object.freeze({
  inspectStorage: (requiredBytes = 0) => inspectInstallationStorage(requiredBytes),
  uninstall: (installationId = product.state.installationId) => uninstallPwaInstallation(installationId),
  async reinstall() {
    const installed = await installPwaBundle(createDemoInstallationBundle());
    localStorage.setItem("loomrealm-demo-installation-v1", installed.installationId);
    return installed;
  },
  install: (bundle: PwaInstallationBundleV1, signal?: AbortSignal) => installPwaBundle(bundle, signal),
  launch: (installationId: string, presentation: unknown) => product.restart(Object.freeze({ installationId, presentation })),
  restart: () => product.restart(),
});
window.__loomrealmPwaQualification = qualification;
