import type { WirePathSegment } from "@loomrealm/wire";

export type GamePackageErrorCode =
  | "GAME_ENTRY_INVALID"
  | "GAME_ENTRY_VERSION_UNSUPPORTED"
  | "SUBSYSTEM_KEY_INVALID"
  | "SUBSYSTEM_KEY_DUPLICATE"
  | "INITIAL_TARGET_UNDECLARED"
  | "INITIAL_INPUT_INVALID";

export class GamePackageError extends Error {
  readonly code: GamePackageErrorCode;
  readonly path: readonly WirePathSegment[];
  declare readonly cause?: unknown;

  constructor(
    code: GamePackageErrorCode,
    path: readonly WirePathSegment[] = [],
    options?: { readonly cause?: unknown },
  ) {
    super(code, options === undefined ? undefined : { cause: options.cause });
    this.name = "GamePackageError";
    this.code = code;
    this.path = Object.freeze([...path]);
  }
}
