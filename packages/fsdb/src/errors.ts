export type FsdbResolutionCode =
  | "DATABASE_PATH_INVALID"
  | "DATABASE_NOT_FOUND"
  | "DATABASE_PATH_AMBIGUOUS"
  | "DATABASE_INVALID"
  | "DATABASE_UNAVAILABLE";

export class FsdbResolutionError extends Error {
  readonly code: FsdbResolutionCode;

  constructor(code: FsdbResolutionCode, message: string = code) {
    super(message);
    this.name = "FsdbResolutionError";
    this.code = code;
  }
}
