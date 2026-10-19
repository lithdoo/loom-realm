/** Directory of the current bundled script, without a trailing slash. Root scripts use "". */
export function moduleDirectoryPath(moduleUrl: string = import.meta.url): string {
  const url = new URL(moduleUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") return "";
  const directory = new URL(".", url).pathname;
  if (directory === "/") return "";
  return directory.endsWith("/") ? directory.slice(0, -1) : directory;
}

/** Absolute path under the directory that served this bundle. */
export function pwaPath(suffix: string, moduleUrl?: string): string {
  const path = suffix.startsWith("/") ? suffix : `/${suffix}`;
  return `${moduleDirectoryPath(moduleUrl)}${path}`;
}
