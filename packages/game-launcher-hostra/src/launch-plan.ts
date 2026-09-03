import type { ValidatedGameEntryV1 } from "@loomrealm/game-package";
import type { JsonValue } from "@loomrealm/wire";
import { launcherError } from "./errors.js";
import type { HostraLaunchManifestV1 } from "./manifest.js";

export interface HostraRunnerPolicy {
  readonly helloDeadlineMs: number;
  readonly frameDeadlineMs: number;
  readonly terminalCleanupDeadlineMs: number;
  readonly terminationGraceMs: number;
}

export interface HostraResolvedRuntime {
  readonly subsystemKey: string;
  readonly logicalModule: string;
  readonly physicalModule: string;
}

export interface HostraLaunchPlan {
  readonly canonicalInstallationRoot: string;
  readonly canonicalNodeExecutable: string;
  readonly runnerEntry: string;
  readonly runnerPolicy: HostraRunnerPolicy;
  readonly runtimes: readonly HostraResolvedRuntime[];
}

export interface PreparedHostraGame {
  readonly logicalBootstrap: {
    readonly subsystemKeys: readonly string[];
    readonly initial: {
      readonly subsystemKey: string;
      readonly input: JsonValue;
    };
  };
  readonly launchPlan: HostraLaunchPlan;
}

function boundedInteger(value: number, minimum: number, maximum: number): boolean {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

export function freezeRunnerPolicy(policy: HostraRunnerPolicy): HostraRunnerPolicy {
  if (
    policy === null ||
    typeof policy !== "object" ||
    !boundedInteger(policy.helloDeadlineMs, 1, 2_147_483_647) ||
    !boundedInteger(policy.frameDeadlineMs, 1_000, 300_000) ||
    !boundedInteger(policy.terminalCleanupDeadlineMs, 1, 300_000) ||
    !boundedInteger(policy.terminationGraceMs, 1, 2_147_483_647)
  ) {
    throw new TypeError("Invalid Hostra Runner policy");
  }
  return Object.freeze({
    helloDeadlineMs: policy.helloDeadlineMs,
    frameDeadlineMs: policy.frameDeadlineMs,
    terminalCleanupDeadlineMs: policy.terminalCleanupDeadlineMs,
    terminationGraceMs: policy.terminationGraceMs,
  });
}

export function joinBindings(
  game: ValidatedGameEntryV1,
  manifest: HostraLaunchManifestV1,
): readonly { readonly subsystemKey: string; readonly logicalModule: string }[] {
  const gameKeys = new Set(game.subsystems.map(({ key }) => key));
  const bindings = new Map(
    manifest.subsystems.map(({ key, module }) => [key, module] as const),
  );
  for (const { key } of game.subsystems) {
    if (!bindings.has(key)) throw launcherError("PLATFORM_BINDING_MISSING");
  }
  for (const { key } of manifest.subsystems) {
    if (!gameKeys.has(key)) throw launcherError("PLATFORM_BINDING_UNDECLARED");
  }
  return Object.freeze(
    game.subsystems.map(({ key }) =>
      Object.freeze({ subsystemKey: key, logicalModule: bindings.get(key)! }),
    ),
  );
}

export function createPreparedHostraGame(options: {
  readonly game: ValidatedGameEntryV1;
  readonly manifest: HostraLaunchManifestV1;
  readonly policy: HostraRunnerPolicy;
  readonly canonicalInstallationRoot: string;
  readonly canonicalNodeExecutable: string;
  readonly runnerEntry: string;
  readonly physicalModules: ReadonlyMap<string, string>;
}): PreparedHostraGame {
  const joined = joinBindings(options.game, options.manifest);
  const runtimes = joined.map(({ subsystemKey, logicalModule }) => {
    const physicalModule = options.physicalModules.get(subsystemKey);
    if (physicalModule === undefined) {
      throw launcherError("SUBSYSTEM_MODULE_NOT_FOUND");
    }
    return Object.freeze({ subsystemKey, logicalModule, physicalModule });
  });
  const runnerPolicy = freezeRunnerPolicy(options.policy);
  const logicalBootstrap = Object.freeze({
    subsystemKeys: Object.freeze(options.game.subsystems.map(({ key }) => key)),
    initial: Object.freeze({
      subsystemKey: options.game.initial.subsystem,
      input: options.game.initial.input,
    }),
  });
  const launchPlan = Object.freeze({
    canonicalInstallationRoot: options.canonicalInstallationRoot,
    canonicalNodeExecutable: options.canonicalNodeExecutable,
    runnerEntry: options.runnerEntry,
    runnerPolicy,
    runtimes: Object.freeze(runtimes),
  });
  return Object.freeze({ logicalBootstrap, launchPlan });
}
