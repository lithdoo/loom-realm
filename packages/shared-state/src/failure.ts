export type SharedStateFailureCode =
  | "INVALID_REQUEST"
  | "LIMIT_EXCEEDED"
  | "CONFLICT"
  | "TERMINAL"
  | "BINDING_UNAVAILABLE"
  | "OUTCOME_UNKNOWN";

export interface SharedStateFailure {
  readonly code: SharedStateFailureCode;
  readonly message: string;
  readonly path?: readonly (string | number)[];
}

export class SharedStateError extends Error implements SharedStateFailure {
  readonly code: SharedStateFailureCode;
  readonly path?: readonly (string | number)[];

  constructor(
    code: SharedStateFailureCode,
    message: string = code,
    path?: readonly (string | number)[],
  ) {
    super(message);
    this.name = "SharedStateError";
    this.code = code;
    if (path !== undefined) this.path = Object.freeze([...path]);
  }
}

export function sharedStateError(
  code: SharedStateFailureCode,
  message: string = code,
  path?: readonly (string | number)[],
): SharedStateError {
  return new SharedStateError(code, message, path);
}

export function isSharedStateFailure(value: unknown): value is SharedStateFailure {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Partial<SharedStateFailure>;
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
