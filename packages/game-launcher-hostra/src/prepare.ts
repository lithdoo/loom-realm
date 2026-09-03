import { readFile } from "node:fs/promises";
import path from "node:path";
import { GamePackageError, parseGameEntryV1 } from "@loomrealm/game-package";
import { HostraLauncherError, launcherError } from "./errors.js";
import {
  createPreparedHostraGame,
  freezeRunnerPolicy,
  joinBindings,
  type HostraRunnerPolicy,
  type PreparedHostraGame,
} from "./launch-plan.js";
import { parseHostraLaunchManifest } from "./manifest.js";
import {
  canonicalizeInstallationRoot,
  preflightNodeExecutable,
  preflightRunnerEntry,
  resolveInstallationModule,
} from "./module-resolver.js";

export interface HostraGameSource {
  readonly installationRoot: string;
}

export interface HostraPrepareOptions {
  readonly source: HostraGameSource;
  readonly runnerPolicy: HostraRunnerPolicy;
}

async function readGameEntry(file: string) {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    void error;
    throw new GamePackageError("GAME_ENTRY_INVALID");
  }
  return parseGameEntryV1(text);
}

async function readManifest(file: string) {
  try {
    return parseHostraLaunchManifest(await readFile(file, "utf8"));
  } catch (error) {
    if (error instanceof HostraLauncherError) throw error;
    void error;
    throw launcherError("PLATFORM_LAUNCH_MANIFEST_INVALID");
  }
}

export async function prepareHostraGame(
  options: HostraPrepareOptions,
): Promise<PreparedHostraGame> {
  if (options === null || typeof options !== "object") {
    throw new TypeError("Invalid Hostra prepare options");
  }
  const policy = freezeRunnerPolicy(options.runnerPolicy);
  const canonicalInstallationRoot = await canonicalizeInstallationRoot(
    options.source?.installationRoot,
  );
  const game = await readGameEntry(path.join(canonicalInstallationRoot, "game.json"));
  const manifest = await readManifest(
    path.join(canonicalInstallationRoot, "launch.hostra.json"),
  );
  const bindings = joinBindings(game, manifest);
  const physicalModules = new Map<string, string>();
  for (const { subsystemKey, logicalModule } of bindings) {
    physicalModules.set(
      subsystemKey,
      await resolveInstallationModule(canonicalInstallationRoot, logicalModule),
    );
  }
  const canonicalNodeExecutable = await preflightNodeExecutable();
  const runnerEntry = await preflightRunnerEntry();
  return createPreparedHostraGame({
    game,
    manifest,
    policy,
    canonicalInstallationRoot,
    canonicalNodeExecutable,
    runnerEntry,
    physicalModules,
  });
}
