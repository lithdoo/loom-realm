export type RealmStateFailureCode =
  | "INVALID_REQUEST"
  | "LIMIT_EXCEEDED"
  | "CONFLICT"
  | "TERMINAL"
  | "BINDING_UNAVAILABLE"
  | "OUTCOME_UNKNOWN";

export interface RealmStateFailure {
  readonly code: RealmStateFailureCode;
  readonly message: string;
  readonly path?: readonly (string | number)[];
}

export class RealmStateError extends Error implements RealmStateFailure {
  readonly code: RealmStateFailureCode;
  readonly path?: readonly (string | number)[];

  constructor(
    code: RealmStateFailureCode,
    message: string = code,
    path?: readonly (string | number)[],
  ) {
    super(message);
    this.name = "RealmStateError";
    this.code = code;
    if (path !== undefined) this.path = Object.freeze([...path]);
  }
}

export function realmStateError(
  code: RealmStateFailureCode,
  message: string = code,
  path?: readonly (string | number)[],
): RealmStateError {
  return new RealmStateError(code, message, path);
}

export function isRealmStateFailure(value: unknown): value is RealmStateFailure {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Partial<RealmStateFailure>;
  return (
    typeof candidate.message === "string" &&
    (candidate.code === "INVALID_REQUEST" ||
      candidate.code === "LIMIT_EXCEEDED" ||
      candidate.code === "CONFLICT" ||
      candidate.code === "TERMINAL" ||
      candidate.code === "BINDING_UNAVAILABLE" ||
      candidate.code === "OUTCOME_UNKNOWN") &&
    (candidate.path === undefined ||
      (Array.isArray(candidate.path) &&
        candidate.path.every(
          (part) => typeof part === "string" || Number.isSafeInteger(part),
        )))
  );
}
