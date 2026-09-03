export type HostraLauncherErrorCode =
  | "PLATFORM_LAUNCH_MANIFEST_INVALID"
  | "PLATFORM_BINDING_MISSING"
  | "PLATFORM_BINDING_UNDECLARED"
  | "SUBSYSTEM_MODULE_INVALID"
  | "SUBSYSTEM_MODULE_NOT_FOUND"
  | "SUBSYSTEM_MODULE_OUTSIDE_INSTALLATION"
  | "PLATFORM_RUNTIME_UNSUPPORTED"
  | "LAUNCH_RUNTIME_UNAVAILABLE"
  | "PROCESS_SPAWN_FAILED"
  | "PROCESS_EXITED_DURING_BOOTSTRAP"
  | "PROCESS_TERMINATION_FAILED";

export class HostraLauncherError extends Error {
  readonly code: HostraLauncherErrorCode;
  declare readonly cause?: unknown;

  constructor(
    code: HostraLauncherErrorCode,
    options?: { readonly cause?: unknown },
  ) {
    super(code, options === undefined ? undefined : { cause: options.cause });
    this.name = "HostraLauncherError";
    this.code = code;
  }
}

export function launcherError(
  code: HostraLauncherErrorCode,
  cause?: unknown,
): HostraLauncherError {
  return new HostraLauncherError(
    code,
    cause === undefined ? undefined : { cause },
  );
}
