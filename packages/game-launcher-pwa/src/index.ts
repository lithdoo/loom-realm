import type { ValidatedGameEntryV1 } from "@loomrealm/game-package";
import {
  prepareRealmStateDefinition,
  type PreparedRealmStateDefinition,
} from "@loomrealm/realm-state";

/** Shared PREPARE projection used by a concrete PWA launch planner before Worker side effects. */
export function projectPwaPreparedRealmState(
  game: ValidatedGameEntryV1,
): PreparedRealmStateDefinition {
  if (game === null || typeof game !== "object") {
    throw new TypeError("Invalid validated Game Entry");
  }
  return prepareRealmStateDefinition(game.state?.records ?? []);
}
