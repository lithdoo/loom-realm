import type { MainRuntimeFailure } from "./model.js";

export class MainRuntimeFatalError extends Error {
  readonly failure: MainRuntimeFailure;

  constructor(failure: MainRuntimeFailure) {
    super(failure.message ?? failure.code);
    this.name = "MainRuntimeFatalError";
    this.failure = failure;
  }
}
