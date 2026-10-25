import { moduleDirectoryPath } from "./base-path.js";
import type { PwaInstallationBundleV1 } from "./installation-bundle.js";
import { ensurePwaBundle } from "./installer.js";
import { startPwaProduct } from "./window-product.js";

interface PokeManBundleFile {
  readonly bundleId: string;
  readonly gameEntryText: string;
  readonly launchManifestText: string;
  readonly presentation: unknown;
  readonly executables: readonly {
    readonly logicalModule: string;
    readonly mime: "text/javascript";
    readonly source: string;
    readonly contentVersion: string;
  }[];
  readonly content: readonly {
    readonly kind: "record" | "group" | "resource";
    readonly namespace: string;
    readonly key: string;
    readonly mime: string;
    readonly body: string;
  }[];
}

function decodeBlob(body: string, mime: string): Blob {
  const binary = atob(body);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([buffer], { type: mime });
}

function storageKey(bundleId: string): string {
  return `loomrealm-pokeman-map-v1:${moduleDirectoryPath() || "/"}:${bundleId}`;
}

async function loadBundle(): Promise<{ readonly bundleId: string; readonly presentation: unknown; readonly bundle: PwaInstallationBundleV1 }> {
  const response = await fetch(new URL("pokeman-bundle.json", import.meta.url), { cache: "no-store" });
  if (!response.ok) throw new Error("PokeMan bundle unavailable");
  const value = await response.json() as PokeManBundleFile;
  if (typeof value.bundleId !== "string" || value.bundleId.length === 0) throw new Error("PokeMan bundle id unavailable");
  return Object.freeze({
    bundleId: value.bundleId,
    presentation: value.presentation,
    bundle: Object.freeze({
      formatVersion: 1 as const,
      gameEntryText: value.gameEntryText,
      launchManifestText: value.launchManifestText,
      content: Object.freeze(value.content.map((entry) => Object.freeze({
        kind: entry.kind,
        namespace: entry.namespace,
        key: entry.key,
        mime: entry.mime,
        body: decodeBlob(entry.body, entry.mime),
      }))),
      executables: Object.freeze(value.executables.map((entry) => Object.freeze({
        logicalModule: entry.logicalModule,
        mime: entry.mime,
        body: new Blob([entry.source], { type: entry.mime }),
      }))),
    }),
  });
}

startPwaProduct(async () => {
  const loaded = await loadBundle();
  const key = storageKey(loaded.bundleId);
  const installation = await ensurePwaBundle(loaded.bundle, localStorage.getItem(key));
  localStorage.setItem(key, installation.installationId);
  return Object.freeze({ installationId: installation.installationId, presentation: loaded.presentation });
});
