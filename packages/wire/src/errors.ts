export type WirePathSegment = string | number;

export class WireValidationError extends TypeError {
  readonly path: readonly WirePathSegment[];

  constructor(message: string, path: readonly WirePathSegment[] = []) {
    super(message);
    this.name = "WireValidationError";
    this.path = Object.freeze([...path]);
  }
}

export class JsonTextSyntaxError extends SyntaxError {
  constructor(message = "Invalid JSON text") {
    super(message);
    this.name = "JsonTextSyntaxError";
  }
}
