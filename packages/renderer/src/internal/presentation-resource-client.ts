import {
  RendererResourceError,
  type RendererResourceClient,
} from "./resource-client.js";

const VERSION = /^sha256:[0-9a-f]{64}$/;

export type PresentationResourceErrorCode =
  | "CONTENT_NOT_FOUND"
  | "CONTENT_CONFLICT"
  | "CONTENT_INVALID"
  | "CONTENT_UNAVAILABLE"
  | "CONTENT_CANCELLED";

export class PresentationResourceError extends Error {
  constructor(readonly code: PresentationResourceErrorCode) {
    super(code);
    this.name = "PresentationResourceError";
  }
}

export interface PresentationResource {
  readonly bytes: Uint8Array;
  readonly mime: string;
  readonly contentVersion: string;
}

export interface PresentationResourceClient {
  resource(
    namespace: string,
    key: string,
    expectedContentVersion: string,
    options?: { readonly signal?: AbortSignal },
  ): Promise<PresentationResource>;
}

function mapError(cause: unknown): PresentationResourceError {
  if (cause instanceof RendererResourceError) {
    const codes: Record<RendererResourceError["code"], PresentationResourceErrorCode> = {
      "not-found": "CONTENT_NOT_FOUND",
      conflict: "CONTENT_CONFLICT",
      invalid: "CONTENT_INVALID",
      unavailable: "CONTENT_UNAVAILABLE",
      cancelled: "CONTENT_CANCELLED",
    };
    return new PresentationResourceError(codes[cause.code]);
  }
  return new PresentationResourceError("CONTENT_UNAVAILABLE");
}

function abortSignal(caller: AbortSignal | undefined, lifetime: AbortSignal): { signal: AbortSignal; dispose(): void } {
  if (caller === undefined) return { signal: lifetime, dispose() {} };
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (caller.aborted || lifetime.aborted) controller.abort();
  else {
    caller.addEventListener("abort", abort, { once: true });
    lifetime.addEventListener("abort", abort, { once: true });
  }
  return {
    signal: controller.signal,
    dispose() {
      caller.removeEventListener("abort", abort);
      lifetime.removeEventListener("abort", abort);
    },
  };
}

function validSignal(value: unknown): value is AbortSignal {
  return value !== null && typeof value === "object" &&
    typeof (value as AbortSignal).aborted === "boolean" &&
    typeof (value as AbortSignal).addEventListener === "function" &&
    typeof (value as AbortSignal).removeEventListener === "function";
}

function validSegment(value: unknown, hierarchy: boolean): value is string {
  return typeof value === "string" && value.length > 0 && value !== "." && value !== ".." &&
    !/[\\\0]|\p{Cc}|\p{Cs}/u.test(value) && (hierarchy || !value.includes("/")) && !value.startsWith("/") && !value.endsWith("/") &&
    !value.split("/").some((part) => part.length === 0 || part === "." || part === "..") &&
    !/^[A-Za-z]:/.test(value) && !value.startsWith("\\\\") && !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value);
}

export function createPresentationResourceClient(
  client: RendererResourceClient,
  lifetimeSignal: AbortSignal,
): PresentationResourceClient {
  if (client === null || typeof client !== "object" || typeof client.resource !== "function" || !validSignal(lifetimeSignal)) {
    throw new TypeError("Invalid presentation resource binding");
  }
  return Object.freeze({
    async resource(namespace: string, key: string, expectedContentVersion: string, options?: { readonly signal?: AbortSignal }) {
      if (!validSegment(namespace, false) || !validSegment(key, true) || !VERSION.test(expectedContentVersion)) {
        throw new PresentationResourceError("CONTENT_INVALID");
      }
      if (options !== undefined && (options === null || typeof options !== "object" ||
        Object.keys(options).some((field) => field !== "signal") ||
        (options.signal !== undefined && !validSignal(options.signal)))) {
        throw new PresentationResourceError("CONTENT_INVALID");
      }
      if (lifetimeSignal.aborted || options?.signal?.aborted) throw new PresentationResourceError("CONTENT_CANCELLED");
      const combined = abortSignal(options?.signal, lifetimeSignal);
      try {
        const resource = await client.resource(namespace, key, expectedContentVersion, combined.signal);
        return Object.freeze({
          bytes: new Uint8Array(resource.bytes),
          mime: resource.mime,
          contentVersion: resource.contentVersion,
        });
      } catch (cause) {
        if (combined.signal.aborted) throw new PresentationResourceError("CONTENT_CANCELLED");
        throw mapError(cause);
      } finally {
        combined.dispose();
      }
    },
  });
}
