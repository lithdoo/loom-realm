export type SessionEventFailureCode =
  | "INVALID_REQUEST"
  | "LIMIT_EXCEEDED"
  | "TERMINAL"
  | "BINDING_UNAVAILABLE"
  | "OUTCOME_UNKNOWN";

export interface SessionEventFailure {
  readonly code: SessionEventFailureCode;
  readonly message: string;
  readonly path?: readonly (string | number)[];
}

export class SessionEventError extends Error implements SessionEventFailure {
  readonly code: SessionEventFailureCode;
  readonly path?: readonly (string | number)[];

  constructor(
    code: SessionEventFailureCode,
    message: string = code,
    path?: readonly (string | number)[],
  ) {
    super(message);
    this.name = "SessionEventError";
    this.code = code;
    if (path !== undefined) this.path = Object.freeze([...path]);
  }
}

export function sessionEventError(
  code: SessionEventFailureCode,
  message: string = code,
  path?: readonly (string | number)[],
): SessionEventError {
  return new SessionEventError(code, message, path);
}

export function isSessionEventFailure(value: unknown): value is SessionEventFailure {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Partial<SessionEventFailure>;
  return (
    typeof candidate.message === "string" &&
    (candidate.code === "INVALID_REQUEST" ||
      candidate.code === "LIMIT_EXCEEDED" ||
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
