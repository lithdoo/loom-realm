export interface WebPresentationResourceRefV1 {
  readonly namespace: string;
  readonly key: string;
}

export interface WebPresentationConfigV1 {
  readonly formatVersion: 1;
  readonly scripts: readonly WebPresentationResourceRefV1[];
  readonly styles: readonly WebPresentationResourceRefV1[];
}

export interface ResolvedBootstrapResource {
  readonly contentVersion: string;
  readonly mime: string;
  readonly browserSource: string;
}

export interface PreparedBootstrapResource extends WebPresentationResourceRefV1, ResolvedBootstrapResource {}

export interface PreparedWebPresentationV1 {
  readonly scripts: readonly PreparedBootstrapResource[];
  readonly styles: readonly PreparedBootstrapResource[];
}

const VERSION = /^sha256:[0-9a-f]{64}$/;

function exactObject(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expected = [...fields].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} has an invalid shape`);
  }
  return record;
}

function segment(value: unknown, label: string, hierarchy: boolean): string {
  if (
    typeof value !== "string" || value.length === 0 || value === "." || value === ".." ||
    /[\\\0]|\p{Cc}|\p{Cs}/u.test(value) || (!hierarchy && value.includes("/")) ||
    value.startsWith("/") || value.endsWith("/") || value.split("/").some((part) => part.length === 0 || part === "." || part === "..") ||
    /^[A-Za-z]:/.test(value) || value.startsWith("\\\\") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)
  ) throw new TypeError(`Invalid ${label}`);
  return value;
}

function refs(value: unknown, label: string): readonly WebPresentationResourceRefV1[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  const seen = new Set<string>();
  return Object.freeze(value.map((candidate, index) => {
    const record = exactObject(candidate, ["namespace", "key"], `${label}[${index}]`);
    const namespace = segment(record.namespace, `${label} namespace`, false);
    const key = segment(record.key, `${label} key`, true);
    const identity = JSON.stringify([namespace, key]);
    if (seen.has(identity)) throw new TypeError(`Duplicate ${label} resource`);
    seen.add(identity);
    return Object.freeze({ namespace, key });
  }));
}

export function validateWebPresentationConfigV1(candidate: unknown): WebPresentationConfigV1 {
  const value = exactObject(candidate, ["formatVersion", "scripts", "styles"], "Web Presentation Config");
  if (value.formatVersion !== 1) throw new TypeError("Unsupported Web Presentation Config formatVersion");
  return Object.freeze({
    formatVersion: 1,
    scripts: refs(value.scripts, "scripts"),
    styles: refs(value.styles, "styles"),
  });
}

function mimeEssence(value: string): string {
  const parts = value.split(";");
  const essence = parts.shift()?.trim().toLowerCase();
  if (essence === undefined || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(essence)) {
    throw new TypeError("Invalid bootstrap resource MIME");
  }
  const token = "[a-zA-Z0-9!#$%&'*+.^_`|~-]+";
  const parameter = new RegExp(`^\\s*${token}\\s*=\\s*(?:${token}|\"(?:[^\"\\\\\\r\\n]|\\\\.)*\")\\s*$`);
  if (parts.some((part) => !parameter.test(part))) throw new TypeError("Invalid bootstrap resource MIME");
  return essence;
}

export async function prepareWebPresentationV1(
  candidate: unknown,
  resolve: (ref: WebPresentationResourceRefV1) => Promise<ResolvedBootstrapResource>,
): Promise<PreparedWebPresentationV1> {
  const config = validateWebPresentationConfigV1(candidate);
  if (typeof resolve !== "function") throw new TypeError("Invalid bootstrap resource resolver");
  const prepare = async (
    list: readonly WebPresentationResourceRefV1[],
    expectedMime: "text/javascript" | "text/css",
  ): Promise<readonly PreparedBootstrapResource[]> => Object.freeze(await Promise.all(list.map(async (ref) => {
    const resolved = await resolve(ref);
    if (
      resolved === null || typeof resolved !== "object" ||
      typeof resolved.contentVersion !== "string" || !VERSION.test(resolved.contentVersion) ||
      typeof resolved.mime !== "string" || mimeEssence(resolved.mime) !== expectedMime ||
      typeof resolved.browserSource !== "string" || resolved.browserSource.length === 0
    ) throw new TypeError("Invalid prepared bootstrap resource");
    return Object.freeze({
      namespace: ref.namespace,
      key: ref.key,
      contentVersion: resolved.contentVersion,
      mime: resolved.mime,
      browserSource: resolved.browserSource,
    });
  })));
  const [styles, scripts] = await Promise.all([
    prepare(config.styles, "text/css"),
    prepare(config.scripts, "text/javascript"),
  ]);
  return Object.freeze({ styles, scripts });
}
