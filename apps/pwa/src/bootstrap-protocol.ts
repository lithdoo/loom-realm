export const PWA_PROTOCOL_VERSION = 1 as const;

export interface PwaServiceWorkerGenerationV1 {
  readonly protocolVersion: 1;
  readonly buildId: string;
  readonly generation: string;
}

export type PwaRuntimeInfoV1 = PwaServiceWorkerGenerationV1;

export interface PwaSessionBootstrapV1 {
  readonly formatVersion: 1;
  readonly sessionEpoch: string;
  readonly installationId: string;
  readonly expectedServiceWorker: PwaServiceWorkerGenerationV1;
  readonly windowBridgePort: MessagePort;
}

export interface PwaInstallRendererControlV1 {
  readonly formatVersion: 1;
  readonly type: "renderer-control/install";
  readonly requestId: string;
  readonly sessionEpoch: string;
  readonly rendererControlToken: string;
  readonly port: MessagePort;
}

export interface PwaInstallRendererDataV1 {
  readonly formatVersion: 1;
  readonly type: "renderer-data/install";
  readonly requestId: string;
  readonly sessionEpoch: string;
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: string;
  readonly connectionId: string;
  readonly port: MessagePort;
}

export interface PwaRevokeRendererDataV1 {
  readonly formatVersion: 1;
  readonly type: "renderer-data/revoke";
  readonly requestId: string;
  readonly sessionEpoch: string;
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: string;
  readonly connectionId: string;
}

export interface PwaWindowBridgeResultV1 {
  readonly formatVersion: 1;
  readonly type: "install/result";
  readonly requestId: string;
  readonly sessionEpoch: string;
  readonly ok: boolean;
  readonly errorCode?: "WINDOW_NOT_CURRENT" | "INSTALL_REJECTED";
}

export interface PwaRunnerBootstrapV1 {
  readonly formatVersion: 1;
  readonly sessionEpoch: string;
  readonly installationId: string;
  readonly expectedServiceWorker: PwaServiceWorkerGenerationV1;
  readonly subsystemKey: string;
  readonly bootstrapToken: string;
  readonly logicalModule: string;
  readonly runtimeControlPort: MessagePort;
  readonly realmStatePort: MessagePort;
  readonly provisioningPort: MessagePort;
}

export interface PwaInstallSubsystemDataV1 {
  readonly formatVersion: 1;
  readonly type: "data/install";
  readonly requestId: string;
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: string;
  readonly connectionId: string;
  readonly port: MessagePort;
}

export interface PwaRevokeSubsystemDataV1 {
  readonly formatVersion: 1;
  readonly type: "data/revoke";
  readonly requestId: string;
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: string;
  readonly connectionId: string;
}

export interface PwaRunnerDataResultV1 {
  readonly formatVersion: 1;
  readonly type: "data/result";
  readonly requestId: string;
  readonly subsystemKey: string;
  readonly connectionId: string;
  readonly ok: boolean;
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

function logicalModule(value: unknown): string {
  const result = text(value, "logicalModule");
  if (new TextEncoder().encode(result).byteLength > 512 || !result.endsWith(".mjs") || result.includes("\\") || result.includes(":")) throw new TypeError("Invalid logicalModule");
  const segments = result.split("/");
  if (segments.some((segment) => !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(segment))) throw new TypeError("Invalid logicalModule");
  return result;
}

function port(value: unknown): MessagePort {
  if (value === null || typeof value !== "object" || typeof (value as MessagePort).postMessage !== "function" || typeof (value as MessagePort).addEventListener !== "function") throw new TypeError("Invalid transferred MessagePort");
  return value as MessagePort;
}

function parseGeneration(value: unknown): PwaServiceWorkerGenerationV1 {
  const item = object(value, ["protocolVersion", "buildId", "generation"], "Service Worker generation");
  if (item.protocolVersion !== 1) throw new TypeError("Invalid Service Worker protocol version");
  return Object.freeze({ protocolVersion: 1, buildId: text(item.buildId, "buildId"), generation: text(item.generation, "generation") });
}

export function sameServiceWorkerGeneration(left: PwaServiceWorkerGenerationV1, right: PwaServiceWorkerGenerationV1): boolean {
  return left.protocolVersion === right.protocolVersion && left.buildId === right.buildId && left.generation === right.generation;
}

export function parsePwaSessionBootstrapV1(value: unknown): PwaSessionBootstrapV1 {
  const item = object(value, ["formatVersion", "sessionEpoch", "installationId", "expectedServiceWorker", "windowBridgePort"], "Session bootstrap");
  if (item.formatVersion !== 1) throw new TypeError("Invalid Session bootstrap version");
  return Object.freeze({ formatVersion: 1, sessionEpoch: text(item.sessionEpoch, "sessionEpoch"), installationId: text(item.installationId, "installationId"), expectedServiceWorker: parseGeneration(item.expectedServiceWorker), windowBridgePort: port(item.windowBridgePort) });
}

export function parsePwaRuntimeInfoV1(value: unknown): PwaRuntimeInfoV1 {
  return parseGeneration(value);
}

export function parsePwaRunnerBootstrapV1(value: unknown): PwaRunnerBootstrapV1 {
  const item = object(value, ["formatVersion", "sessionEpoch", "installationId", "expectedServiceWorker", "subsystemKey", "bootstrapToken", "logicalModule", "runtimeControlPort", "realmStatePort", "provisioningPort"], "Runner bootstrap");
  if (item.formatVersion !== 1) throw new TypeError("Invalid Runner bootstrap version");
  return Object.freeze({
    formatVersion: 1,
    sessionEpoch: text(item.sessionEpoch, "sessionEpoch"),
    installationId: text(item.installationId, "installationId"),
    expectedServiceWorker: parseGeneration(item.expectedServiceWorker),
    subsystemKey: text(item.subsystemKey, "subsystemKey"),
    bootstrapToken: text(item.bootstrapToken, "bootstrapToken"),
    logicalModule: logicalModule(item.logicalModule),
    runtimeControlPort: port(item.runtimeControlPort),
    realmStatePort: port(item.realmStatePort),
    provisioningPort: port(item.provisioningPort),
  });
}

export function parseInstallRendererControl(value: unknown, epoch: string): PwaInstallRendererControlV1 {
  const item = object(value, ["formatVersion", "type", "requestId", "sessionEpoch", "rendererControlToken", "port"], "Renderer Control install");
  if (item.type !== "renderer-control/install" || item.formatVersion !== 1 || item.sessionEpoch !== epoch) throw new TypeError("Stale Renderer Control install");
  return Object.freeze({ formatVersion: 1, type: item.type, requestId: text(item.requestId, "requestId"), sessionEpoch: epoch, rendererControlToken: text(item.rendererControlToken, "rendererControlToken"), port: port(item.port) });
}

export function parseInstallRendererData(value: unknown, epoch: string): PwaInstallRendererDataV1 {
  const item = object(value, ["formatVersion", "type", "requestId", "sessionEpoch", "subsystemKey", "generation", "dataProfile", "connectionId", "port"], "Renderer Data install");
  if (item.type !== "renderer-data/install" || item.formatVersion !== 1 || item.sessionEpoch !== epoch || !Number.isSafeInteger(item.generation) || Number(item.generation) <= 0) throw new TypeError("Stale Renderer Data install");
  return Object.freeze({ formatVersion: 1, type: item.type, requestId: text(item.requestId, "requestId"), sessionEpoch: epoch, subsystemKey: text(item.subsystemKey, "subsystemKey"), generation: item.generation as number, dataProfile: text(item.dataProfile, "dataProfile"), connectionId: text(item.connectionId, "connectionId"), port: port(item.port) });
}

export function parseRevokeRendererData(value: unknown, epoch: string): PwaRevokeRendererDataV1 {
  const item = object(value, ["formatVersion", "type", "requestId", "sessionEpoch", "subsystemKey", "generation", "dataProfile", "connectionId"], "Renderer Data revoke");
  if (item.type !== "renderer-data/revoke" || item.formatVersion !== 1 || item.sessionEpoch !== epoch || !Number.isSafeInteger(item.generation) || Number(item.generation) <= 0) throw new TypeError("Stale Renderer Data revoke");
  return Object.freeze({ formatVersion: 1, type: item.type, requestId: text(item.requestId, "requestId"), sessionEpoch: epoch, subsystemKey: text(item.subsystemKey, "subsystemKey"), generation: item.generation as number, dataProfile: text(item.dataProfile, "dataProfile"), connectionId: text(item.connectionId, "connectionId") });
}

export function parseWindowBridgeResult(value: unknown, epoch: string, requestId: string): PwaWindowBridgeResultV1 {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid Window bridge result");
  const raw = value as Record<string, unknown>;
  const item = object(value, raw.ok === true ? ["formatVersion", "type", "requestId", "sessionEpoch", "ok"] : ["formatVersion", "type", "requestId", "sessionEpoch", "ok", "errorCode"], "Window bridge result");
  if (item.type !== "install/result" || item.formatVersion !== 1 || item.sessionEpoch !== epoch || item.requestId !== requestId || typeof item.ok !== "boolean") throw new TypeError("Invalid Window bridge correlation");
  if (item.ok === false && item.errorCode !== "WINDOW_NOT_CURRENT" && item.errorCode !== "INSTALL_REJECTED") throw new TypeError("Invalid Window bridge error");
  if (item.ok) return Object.freeze({ formatVersion: 1, type: "install/result", requestId, sessionEpoch: epoch, ok: true });
  return Object.freeze({ formatVersion: 1, type: "install/result", requestId, sessionEpoch: epoch, ok: false, errorCode: item.errorCode as "WINDOW_NOT_CURRENT" | "INSTALL_REJECTED" });
}

export function parseInstallSubsystemData(value: unknown, subsystemKey: string): PwaInstallSubsystemDataV1 {
  const item = object(value, ["formatVersion", "type", "requestId", "subsystemKey", "generation", "dataProfile", "connectionId", "port"], "Subsystem Data install");
  if (item.type !== "data/install" || item.formatVersion !== 1 || item.subsystemKey !== subsystemKey || !Number.isSafeInteger(item.generation) || Number(item.generation) <= 0) throw new TypeError("Invalid Subsystem Data install");
  return Object.freeze({ formatVersion: 1, type: item.type, requestId: text(item.requestId, "requestId"), subsystemKey, generation: item.generation as number, dataProfile: text(item.dataProfile, "dataProfile"), connectionId: text(item.connectionId, "connectionId"), port: port(item.port) });
}

export function parseRevokeSubsystemData(value: unknown, subsystemKey: string): PwaRevokeSubsystemDataV1 {
  const item = object(value, ["formatVersion", "type", "requestId", "subsystemKey", "generation", "dataProfile", "connectionId"], "Subsystem Data revoke");
  if (item.type !== "data/revoke" || item.formatVersion !== 1 || item.subsystemKey !== subsystemKey || !Number.isSafeInteger(item.generation) || Number(item.generation) <= 0) throw new TypeError("Invalid Subsystem Data revoke");
  return Object.freeze({ formatVersion: 1, type: item.type, requestId: text(item.requestId, "requestId"), subsystemKey, generation: item.generation as number, dataProfile: text(item.dataProfile, "dataProfile"), connectionId: text(item.connectionId, "connectionId") });
}

export function parseRunnerDataResult(value: unknown, subsystemKey: string, requestId: string): PwaRunnerDataResultV1 {
  const item = object(value, ["formatVersion", "type", "requestId", "subsystemKey", "connectionId", "ok"], "Runner Data result");
  if (item.formatVersion !== 1 || item.type !== "data/result" || item.requestId !== requestId || item.subsystemKey !== subsystemKey || typeof item.ok !== "boolean") throw new TypeError("Invalid Runner Data result");
  return Object.freeze({ formatVersion: 1, type: item.type, requestId, subsystemKey, connectionId: text(item.connectionId, "connectionId"), ok: item.ok });
}
