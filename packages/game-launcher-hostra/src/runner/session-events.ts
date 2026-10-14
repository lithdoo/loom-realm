export const SESSION_EVENTS_ENDPOINT_ENV_KEY =
  "LOOMREALM_HOSTRA_SESSION_EVENTS_ENDPOINT";

export function parseSessionEventsEndpoint(value: unknown): string {
  if (typeof value !== "string") throw new TypeError("Invalid Session Events endpoint");
  let endpoint: URL;
  try { endpoint = new URL(value); }
  catch { throw new TypeError("Invalid Session Events endpoint"); }
  if (
    endpoint.protocol !== "ws:" || endpoint.hostname !== "127.0.0.1" ||
    endpoint.username !== "" || endpoint.password !== "" || endpoint.search !== "" ||
    endpoint.hash !== "" || endpoint.port === "" ||
    !/^\/[A-Za-z0-9_-]{43}$/.test(endpoint.pathname)
  ) throw new TypeError("Invalid Session Events endpoint");
  return endpoint.href;
}
