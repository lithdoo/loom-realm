import {
  GamePackageError,
  parseGameEntryV1,
  type ValidatedGameEntryV1,
} from "@loomrealm/game-package";
import {
  prepareRealmStateDefinition,
  type PreparedRealmStateDefinition,
} from "@loomrealm/realm-state";
import { utf8ByteLength, type JsonValue } from "@loomrealm/wire";

const MODULE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const VERSION = /^sha256:[0-9a-f]{64}$/;

export type PwaLauncherErrorCode =
  | "PLATFORM_LAUNCH_MANIFEST_INVALID"
  | "PLATFORM_BINDING_MISSING"
  | "PLATFORM_BINDING_UNDECLARED"
  | "SUBSYSTEM_MODULE_INVALID"
  | "SUBSYSTEM_MODULE_NOT_FOUND"
  | "SUBSYSTEM_MODULE_OUTSIDE_INSTALLATION"
  | "SUBSYSTEM_MODULE_GRAPH_INVALID"
  | "SUBSYSTEM_MODULE_LOAD_FAILED"
  | "SUBSYSTEM_MODULE_ABI_INVALID"
  | "PLATFORM_RUNTIME_UNSUPPORTED";

export class PwaLauncherError extends Error {
  constructor(readonly code: PwaLauncherErrorCode, options?: ErrorOptions) {
    super(code, options);
    this.name = "PwaLauncherError";
  }
}

function fail(code: PwaLauncherErrorCode, cause?: unknown): never {
  throw new PwaLauncherError(code, cause === undefined ? undefined : { cause });
}

function exactObject(
  value: unknown,
  required: readonly string[],
  label: string,
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`Invalid ${label}`);
  }
  const result = value as Record<string, unknown>;
  const keys = Object.keys(result);
  if (
    keys.length !== required.length ||
    required.some((key) => !Object.prototype.hasOwnProperty.call(result, key))
  ) {
    throw new TypeError(`Invalid ${label}`);
  }
  return result;
}

function validSubsystemKey(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || utf8ByteLength(value) > 256) return false;
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

export interface PwaSubsystemBindingV1 {
  readonly key: string;
  readonly module: string;
}

export interface PwaLaunchManifestV1 {
  readonly formatVersion: 1;
  readonly subsystems: readonly PwaSubsystemBindingV1[];
}

export function validatePwaLogicalModule(value: unknown): string {
  if (
    typeof value !== "string" || value.length === 0 || utf8ByteLength(value) > 512 ||
    !value.endsWith(".mjs") || value.includes("\\") || value.includes(":")
  ) return fail("SUBSYSTEM_MODULE_INVALID");
  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === ".." || !MODULE_SEGMENT.test(segment))) {
    return fail("SUBSYSTEM_MODULE_INVALID");
  }
  return value;
}

export function parsePwaLaunchManifestV1(text: string): PwaLaunchManifestV1 {
  try {
    const value = exactObject(JSON.parse(text), ["formatVersion", "subsystems"], "PWA launch manifest");
    if (value.formatVersion !== 1 || !Array.isArray(value.subsystems)) throw new TypeError();
    const seen = new Set<string>();
    const subsystems = value.subsystems.map((candidate) => {
      const binding = exactObject(candidate, ["key", "module"], "PWA subsystem binding");
      if (!validSubsystemKey(binding.key) || seen.has(binding.key)) throw new TypeError();
      seen.add(binding.key);
      return Object.freeze({ key: binding.key, module: validatePwaLogicalModule(binding.module) });
    });
    return Object.freeze({ formatVersion: 1, subsystems: Object.freeze(subsystems) });
  } catch (cause) {
    fail("PLATFORM_LAUNCH_MANIFEST_INVALID", cause);
  }
}

export interface PwaExecutableModuleSourceV1 {
  readonly logicalModule: string;
  readonly source: string;
  readonly contentVersion: string;
}

export interface PwaExecutableIndexEntryV1 {
  readonly logicalModule: string;
  readonly contentVersion: string;
  readonly imports: readonly string[];
}

function resolveRelativeModule(from: string, specifier: string): string {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return fail("SUBSYSTEM_MODULE_GRAPH_INVALID");
  if (specifier.includes("\\") || specifier.includes(":") || specifier.includes("?") || specifier.includes("#")) {
    return fail("SUBSYSTEM_MODULE_GRAPH_INVALID");
  }
  const output = from.split("/");
  output.pop();
  for (const segment of specifier.split("/")) {
    if (segment === "." || segment === "") continue;
    if (segment === "..") {
      if (output.length === 0) return fail("SUBSYSTEM_MODULE_OUTSIDE_INSTALLATION");
      output.pop();
    } else {
      if (!MODULE_SEGMENT.test(segment)) return fail("SUBSYSTEM_MODULE_INVALID");
      output.push(segment);
    }
  }
  return validatePwaLogicalModule(output.join("/"));
}

/** Installation-time ESM graph enumeration for the v1 relative-import subset. */
export function buildPwaExecutableIndexV1(
  modules: readonly PwaExecutableModuleSourceV1[],
): readonly PwaExecutableIndexEntryV1[] {
  if (!Array.isArray(modules) || modules.length === 0) return fail("SUBSYSTEM_MODULE_NOT_FOUND");
  const sources = new Map<string, PwaExecutableModuleSourceV1>();
  for (const candidate of modules) {
    const value = exactObject(candidate, ["logicalModule", "source", "contentVersion"], "executable module");
    const logicalModule = validatePwaLogicalModule(value.logicalModule);
    if (typeof value.source !== "string" || !VERSION.test(String(value.contentVersion)) || sources.has(logicalModule)) {
      return fail("SUBSYSTEM_MODULE_INVALID");
    }
    sources.set(logicalModule, { logicalModule, source: value.source, contentVersion: value.contentVersion as string });
  }
  const entries: PwaExecutableIndexEntryV1[] = [];
  const staticImport = /(?:\bimport\s*(?:[^"'();]*?\sfrom\s*)?|\bexport\s+[^"']*?\sfrom\s*|\bimport\s*\(\s*)["']([^"']+)["']\s*\)?/g;
  for (const module of sources.values()) {
    const imports: string[] = [];
    const matchedRanges: Array<readonly [number, number]> = [];
    for (const match of module.source.matchAll(staticImport)) {
      const specifier = match[1];
      if (specifier === undefined || match.index === undefined) continue;
      matchedRanges.push([match.index, match.index + match[0].length]);
      const resolved = resolveRelativeModule(module.logicalModule, specifier);
      if (!sources.has(resolved)) return fail("SUBSYSTEM_MODULE_NOT_FOUND");
      if (!imports.includes(resolved)) imports.push(resolved);
    }
    for (const match of module.source.matchAll(/\bimport\s*\(/g)) {
      const position = match.index ?? -1;
      if (!matchedRanges.some(([start, end]) => position >= start && position < end)) return fail("SUBSYSTEM_MODULE_GRAPH_INVALID");
    }
    entries.push(Object.freeze({
      logicalModule: module.logicalModule,
      contentVersion: module.contentVersion,
      imports: Object.freeze(imports),
    }));
  }
  return Object.freeze(entries);
}

export interface PwaRunnerPolicy {
  readonly helloDeadlineMs: number;
  readonly frameDeadlineMs: number;
  readonly terminalCleanupDeadlineMs: number;
}

export interface ResolvedPwaSubsystemModuleV1 {
  readonly installationId: string;
  readonly installationGeneration: string;
  readonly subsystemKey: string;
  readonly logicalModule: string;
  readonly imports: readonly string[];
}

export interface PwaServiceWorkerGenerationV1 {
  readonly protocolVersion: 1;
  readonly buildId: string;
  readonly generation: string;
}

export interface PwaLaunchPlan {
  readonly installationId: string;
  readonly installationGeneration: string;
  readonly expectedServiceWorker: PwaServiceWorkerGenerationV1;
  readonly runnerPolicy: PwaRunnerPolicy;
  readonly runtimes: readonly ResolvedPwaSubsystemModuleV1[];
}

export interface LogicalGameBootstrap {
  readonly subsystemKeys: readonly string[];
  readonly initial: { readonly subsystemKey: string; readonly input: JsonValue };
}

export interface PreparedPwaGame {
  readonly logicalBootstrap: LogicalGameBootstrap;
  readonly state: PreparedRealmStateDefinition;
  readonly launchPlan: PwaLaunchPlan;
}

export interface PwaPrepareGameRequestV1 {
  readonly installationId: string;
}

export interface PublishedPwaInstallationV1 {
  readonly installationId: string;
  readonly generation: string;
  readonly gameEntryText: string;
  readonly launchManifestText: string;
  readonly executableIndex: readonly PwaExecutableIndexEntryV1[];
}

export interface PwaPrepareDependencies {
  readonly openPublishedInstallation: (installationId: string, signal?: AbortSignal) => Promise<PublishedPwaInstallationV1>;
  readonly expectedServiceWorker: PwaServiceWorkerGenerationV1;
  readonly runnerPolicy: PwaRunnerPolicy;
  readonly resolveModuleUrl: (logicalModule: string) => string;
}

function freezeRunnerPolicy(value: PwaRunnerPolicy): PwaRunnerPolicy {
  if (
    value === null || typeof value !== "object" ||
    !Number.isInteger(value.helloDeadlineMs) || value.helloDeadlineMs < 1 ||
    !Number.isInteger(value.frameDeadlineMs) || value.frameDeadlineMs < 1_000 || value.frameDeadlineMs > 300_000 ||
    !Number.isInteger(value.terminalCleanupDeadlineMs) || value.terminalCleanupDeadlineMs < 1 || value.terminalCleanupDeadlineMs > 300_000
  ) throw new TypeError("Invalid PWA Runner policy");
  return Object.freeze({
    helloDeadlineMs: value.helloDeadlineMs,
    frameDeadlineMs: value.frameDeadlineMs,
    terminalCleanupDeadlineMs: value.terminalCleanupDeadlineMs,
  });
}

function validateExecutableIndex(value: readonly PwaExecutableIndexEntryV1[]): ReadonlyMap<string, PwaExecutableIndexEntryV1> {
  if (!Array.isArray(value) || value.length === 0) return fail("SUBSYSTEM_MODULE_NOT_FOUND");
  const index = new Map<string, PwaExecutableIndexEntryV1>();
  for (const candidate of value) {
    const entry = exactObject(candidate, ["logicalModule", "contentVersion", "imports"], "Executable Index entry");
    const logicalModule = validatePwaLogicalModule(entry.logicalModule);
    if (!VERSION.test(String(entry.contentVersion)) || !Array.isArray(entry.imports) || index.has(logicalModule)) {
      return fail("SUBSYSTEM_MODULE_INVALID");
    }
    const imports = entry.imports.map((item) => validatePwaLogicalModule(item));
    index.set(logicalModule, Object.freeze({ logicalModule, contentVersion: entry.contentVersion as string, imports: Object.freeze(imports) }));
  }
  for (const entry of index.values()) if (entry.imports.some((item) => !index.has(item))) return fail("SUBSYSTEM_MODULE_NOT_FOUND");
  return index;
}

export async function preparePwaGame(request: PwaPrepareGameRequestV1, dependencies: PwaPrepareDependencies, signal?: AbortSignal): Promise<PreparedPwaGame> {
  const requestValue = exactObject(request, ["installationId"], "PWA prepare request");
  if (!validSubsystemKey(requestValue.installationId)) throw new TypeError("Invalid PWA installation");
  if (dependencies === null || typeof dependencies !== "object" || typeof dependencies.openPublishedInstallation !== "function" || typeof dependencies.resolveModuleUrl !== "function") throw new TypeError("Invalid PWA prepare dependencies");
  if (signal?.aborted) throw signal.reason;
  const installation = await dependencies.openPublishedInstallation(requestValue.installationId, signal);
  const installationValue = exactObject(installation, ["installationId", "generation", "gameEntryText", "launchManifestText", "executableIndex"], "published PWA installation");
  if (installationValue.installationId !== requestValue.installationId || !validSubsystemKey(installationValue.generation)) throw new TypeError("Invalid published PWA installation");
  const expectedServiceWorker = exactObject(dependencies.expectedServiceWorker, ["protocolVersion", "buildId", "generation"], "Service Worker generation") as unknown as PwaServiceWorkerGenerationV1;
  if (expectedServiceWorker.protocolVersion !== 1 || !validSubsystemKey(expectedServiceWorker.buildId) || !validSubsystemKey(expectedServiceWorker.generation)) throw new TypeError("Invalid Service Worker generation");
  let game: ValidatedGameEntryV1;
  try { game = parseGameEntryV1(installationValue.gameEntryText as string); }
  catch (cause) {
    if (cause instanceof GamePackageError) throw cause;
    throw new GamePackageError("GAME_ENTRY_INVALID");
  }
  const manifest = parsePwaLaunchManifestV1(installationValue.launchManifestText as string);
  const gameKeys = new Set(game.subsystems.map(({ key }) => key));
  const bindings = new Map(manifest.subsystems.map(({ key, module }) => [key, module] as const));
  for (const { key } of game.subsystems) if (!bindings.has(key)) fail("PLATFORM_BINDING_MISSING");
  for (const { key } of manifest.subsystems) if (!gameKeys.has(key)) fail("PLATFORM_BINDING_UNDECLARED");
  const index = validateExecutableIndex(installationValue.executableIndex as readonly PwaExecutableIndexEntryV1[]);
  const currentOrigin = typeof location === "object" ? location.origin : undefined;
  const runtimes = game.subsystems.map(({ key }) => {
    const logicalModule = bindings.get(key)!;
    const executable = index.get(logicalModule);
    if (executable === undefined) return fail("SUBSYSTEM_MODULE_NOT_FOUND");
    let moduleUrl: URL;
    try { moduleUrl = new URL(dependencies.resolveModuleUrl(logicalModule)); }
    catch (cause) { return fail("SUBSYSTEM_MODULE_OUTSIDE_INSTALLATION", cause); }
    const expectedPath = `/_lr/internal/executables/${encodeURIComponent(request.installationId)}/${logicalModule.split("/").map(encodeURIComponent).join("/")}`;
    if (
      (moduleUrl.protocol !== "http:" && moduleUrl.protocol !== "https:") ||
      currentOrigin === undefined || moduleUrl.origin !== currentOrigin || moduleUrl.pathname !== expectedPath ||
      moduleUrl.search !== "" || moduleUrl.hash !== ""
    ) return fail("SUBSYSTEM_MODULE_OUTSIDE_INSTALLATION");
    return Object.freeze({
      installationId: request.installationId,
      installationGeneration: installationValue.generation as string,
      subsystemKey: key,
      logicalModule,
      imports: executable.imports,
    });
  });
  const logicalBootstrap: LogicalGameBootstrap = Object.freeze({
    subsystemKeys: Object.freeze(game.subsystems.map(({ key }) => key)),
    initial: Object.freeze({ subsystemKey: game.initial.subsystem, input: game.initial.input }),
  });
  return Object.freeze({
    logicalBootstrap,
    state: prepareRealmStateDefinition(game.state?.records ?? []),
    launchPlan: Object.freeze({
      installationId: request.installationId,
      installationGeneration: installationValue.generation as string,
      expectedServiceWorker: Object.freeze({ ...expectedServiceWorker }),
      runnerPolicy: freezeRunnerPolicy(dependencies.runnerPolicy),
      runtimes: Object.freeze(runtimes),
    }),
  });
}

/** Shared PREPARE projection retained as a narrow low-level helper. */
export function projectPwaPreparedRealmState(game: ValidatedGameEntryV1): PreparedRealmStateDefinition {
  if (game === null || typeof game !== "object") throw new TypeError("Invalid validated Game Entry");
  return prepareRealmStateDefinition(game.state?.records ?? []);
}
