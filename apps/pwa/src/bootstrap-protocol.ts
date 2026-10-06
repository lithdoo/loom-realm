export const PWA_PROTOCOL_VERSION = 1 as const;

export interface PwaSessionBootstrapV1 {
  readonly type: "loomrealm.pwa.session-bootstrap";
  readonly version: 1;
  readonly sessionEpoch: string;
  readonly serviceWorkerGeneration: string;
  readonly installationId: string;
  readonly windowBridgePort: MessagePort;
}

export interface PwaServiceWorkerGenerationV1 {
  readonly type: "loomrealm.pwa.sw-generation";
  readonly version: 1;
  readonly generation: string;
}

export interface PwaRuntimeInfoV1 {
  readonly version: 1;
  readonly generation: string;
}

export interface PwaInstallRendererControlV1 {
  readonly type: "loomrealm.pwa.install-renderer-control";
  readonly version: 1;
  readonly requestId: string;
  readonly sessionEpoch: string;
  readonly rendererControlToken: string;
  readonly port: MessagePort;
}

export interface PwaInstallRendererDataV1 {
  readonly type: "loomrealm.pwa.install-renderer-data";
  readonly version: 1;
  readonly requestId: string;
  readonly sessionEpoch: string;
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: string;
  readonly port: MessagePort;
}

export interface PwaWindowBridgeResultV1 {
  readonly type: "loomrealm.pwa.window-bridge-result";
  readonly version: 1;
  readonly requestId: string;
  readonly sessionEpoch: string;
  readonly ok: boolean;
}

export interface PwaRunnerBootstrapV1 {
  readonly type: "loomrealm.pwa.runner-bootstrap";
  readonly version: 1;
  readonly sessionEpoch: string;
  readonly serviceWorkerGeneration: string;
  readonly installationId: string;
  readonly subsystemKey: string;
  readonly logicalModule: string;
  readonly moduleUrl: string;
  readonly bootstrapToken: string;
  readonly controlProtocolVersions: readonly [1];
  readonly helloDeadlineMs: number;
  readonly frameDeadlineMs: number;
  readonly terminalCleanupDeadlineMs: number;
  readonly runtimeControlPort: MessagePort;
  readonly realmStatePort: MessagePort;
  readonly provisioningPort: MessagePort;
}

export interface PwaInstallSubsystemDataV1 {
  readonly type: "loomrealm.pwa.install-subsystem-data";
  readonly version: 1;
  readonly requestId: string;
  readonly sessionEpoch: string;
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: string;
  readonly port: MessagePort;
}

export interface PwaRevokeSubsystemDataV1 {
  readonly type: "loomrealm.pwa.revoke-subsystem-data";
  readonly version: 1;
  readonly requestId: string;
  readonly sessionEpoch: string;
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: string;
}

function object(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`Invalid ${label}`);
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expected = [...fields].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) throw new TypeError(`Invalid ${label}`);
  return record;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 1024) throw new TypeError(`Invalid ${label}`);
  return value;
}

function port(value: unknown): MessagePort {
  if (value === null || typeof value !== "object" || typeof (value as MessagePort).postMessage !== "function" || typeof (value as MessagePort).addEventListener !== "function") {
    throw new TypeError("Invalid transferred MessagePort");
  }
  return value as MessagePort;
}

function positive(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new TypeError(`Invalid ${label}`);
  return value as number;
}

export function parsePwaSessionBootstrapV1(value: unknown): PwaSessionBootstrapV1 {
  const item = object(value, ["type", "version", "sessionEpoch", "serviceWorkerGeneration", "installationId", "windowBridgePort"], "Session bootstrap");
  if (item.type !== "loomrealm.pwa.session-bootstrap" || item.version !== 1) throw new TypeError("Invalid Session bootstrap version");
  return Object.freeze({ type: item.type, version: 1, sessionEpoch: text(item.sessionEpoch, "sessionEpoch"), serviceWorkerGeneration: text(item.serviceWorkerGeneration, "SW generation"), installationId: text(item.installationId, "installationId"), windowBridgePort: port(item.windowBridgePort) });
}

export function parsePwaRuntimeInfoV1(value: unknown): PwaRuntimeInfoV1 {
  const item = object(value, ["version", "generation"], "Runtime info");
  if (item.version !== 1) throw new TypeError("Invalid Runtime info version");
  return Object.freeze({ version: 1, generation: text(item.generation, "Runtime generation") });
}

export function parsePwaRunnerBootstrapV1(value: unknown): PwaRunnerBootstrapV1 {
  const fields = ["type", "version", "sessionEpoch", "serviceWorkerGeneration", "installationId", "subsystemKey", "logicalModule", "moduleUrl", "bootstrapToken", "controlProtocolVersions", "helloDeadlineMs", "frameDeadlineMs", "terminalCleanupDeadlineMs", "runtimeControlPort", "realmStatePort", "provisioningPort"];
  const item = object(value, fields, "Runner bootstrap");
  if (item.type !== "loomrealm.pwa.runner-bootstrap" || item.version !== 1 || !Array.isArray(item.controlProtocolVersions) || item.controlProtocolVersions.length !== 1 || item.controlProtocolVersions[0] !== 1) throw new TypeError("Invalid Runner bootstrap version");
  const installationId = text(item.installationId, "installationId");
  const logicalModule = text(item.logicalModule, "logicalModule");
  const moduleUrl = new URL(text(item.moduleUrl, "moduleUrl"));
  const expected = `/_lr/internal/executables/${encodeURIComponent(installationId)}/${logicalModule.split("/").map(encodeURIComponent).join("/")}`;
  if (moduleUrl.origin !== location.origin || moduleUrl.pathname !== expected || moduleUrl.search || moduleUrl.hash) throw new TypeError("Invalid Runner module binding");
  return Object.freeze({
    type: item.type, version: 1,
    sessionEpoch: text(item.sessionEpoch, "sessionEpoch"),
    serviceWorkerGeneration: text(item.serviceWorkerGeneration, "SW generation"),
    installationId,
    subsystemKey: text(item.subsystemKey, "subsystemKey"),
    logicalModule,
    moduleUrl: moduleUrl.href,
    bootstrapToken: text(item.bootstrapToken, "bootstrapToken"),
    controlProtocolVersions: Object.freeze([1] as [1]),
    helloDeadlineMs: positive(item.helloDeadlineMs, "helloDeadlineMs"),
    frameDeadlineMs: positive(item.frameDeadlineMs, "frameDeadlineMs"),
    terminalCleanupDeadlineMs: positive(item.terminalCleanupDeadlineMs, "terminalCleanupDeadlineMs"),
    runtimeControlPort: port(item.runtimeControlPort),
    realmStatePort: port(item.realmStatePort),
    provisioningPort: port(item.provisioningPort),
  });
}

export function parseInstallRendererControl(value: unknown, epoch: string): PwaInstallRendererControlV1 {
  const item = object(value, ["type", "version", "requestId", "sessionEpoch", "rendererControlToken", "port"], "Renderer Control install");
  if (item.type !== "loomrealm.pwa.install-renderer-control" || item.version !== 1 || item.sessionEpoch !== epoch) throw new TypeError("Stale Renderer Control install");
  return Object.freeze({ type: item.type, version: 1, requestId: text(item.requestId, "requestId"), sessionEpoch: epoch, rendererControlToken: text(item.rendererControlToken, "rendererControlToken"), port: port(item.port) });
}

export function parseInstallRendererData(value: unknown, epoch: string): PwaInstallRendererDataV1 {
  const item = object(value, ["type", "version", "requestId", "sessionEpoch", "subsystemKey", "generation", "dataProfile", "port"], "Renderer Data install");
  if (item.type !== "loomrealm.pwa.install-renderer-data" || item.version !== 1 || item.sessionEpoch !== epoch) throw new TypeError("Stale Renderer Data install");
  return Object.freeze({ type: item.type, version: 1, requestId: text(item.requestId, "requestId"), sessionEpoch: epoch, subsystemKey: text(item.subsystemKey, "subsystemKey"), generation: positive(item.generation, "generation"), dataProfile: text(item.dataProfile, "dataProfile"), port: port(item.port) });
}

export function parseWindowBridgeResult(value: unknown, epoch: string, requestId: string): PwaWindowBridgeResultV1 {
  const item = object(value, ["type", "version", "requestId", "sessionEpoch", "ok"], "Window bridge result");
  if (item.type !== "loomrealm.pwa.window-bridge-result" || item.version !== 1 || item.sessionEpoch !== epoch || item.requestId !== requestId || typeof item.ok !== "boolean") throw new TypeError("Invalid Window bridge correlation");
  return Object.freeze({ type: item.type, version: 1, requestId, sessionEpoch: epoch, ok: item.ok });
}
