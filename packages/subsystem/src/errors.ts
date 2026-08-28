export type FrameCallRejectedCode =
  | "FRAME_CALL_TARGET_NOT_FOUND"
  | "FRAME_CALL_TARGET_UNAVAILABLE";

export class FrameCallRejectedError extends Error {
  readonly code: FrameCallRejectedCode;

  constructor(code: FrameCallRejectedCode) {
    super(code === "FRAME_CALL_TARGET_NOT_FOUND" ? "Frame call target was not found" : "Frame call target is unavailable");
    this.name = "FrameCallRejectedError";
    this.code = code;
  }
}

export class FrameBusyError extends Error {
  constructor() {
    super("Frame already has a pending mutation");
    this.name = "FrameBusyError";
  }
}

export class FrameInactiveError extends Error {
  constructor() {
    super("Frame is not currently active");
    this.name = "FrameInactiveError";
  }
}

export class FrameClosedError extends Error {
  constructor() {
    super("Frame is closed");
    this.name = "FrameClosedError";
  }
}
