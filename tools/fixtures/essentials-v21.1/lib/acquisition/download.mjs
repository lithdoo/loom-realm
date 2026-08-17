import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fail, ImportFailure } from "../errors.mjs";

const DEFAULT_MAX_REDIRECTS = 8;

export async function fetchFollowingRedirects(url, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  let current = new URL(url);
  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    if (current.protocol !== "https:") fail("DOWNLOAD_REDIRECT_FAILURE", `Download URL is not HTTPS: ${current.origin}`);
    if (options.allowUrl && !options.allowUrl(current)) fail("DOWNLOAD_REDIRECT_FAILURE", `Download URL is outside the allowed authority: ${current.origin}`);
    let response;
    try { response = await fetchImpl(current, { redirect: "manual", headers: options.headers }); } catch (error) {
      fail("DOWNLOAD_FAILURE", `Download request failed: ${error.message}`);
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) fail("DOWNLOAD_REDIRECT_FAILURE", "Download redirect has no Location header");
      try { current = new URL(location, current); } catch { fail("DOWNLOAD_REDIRECT_FAILURE", "Download redirect Location is invalid"); }
      continue;
    }
    if (!response.ok || !response.body) fail("DOWNLOAD_FAILURE", `Download failed with HTTP ${response.status}`);
    return { response, url: current };
  }
  fail("DOWNLOAD_REDIRECT_FAILURE", `Download exceeded ${maxRedirects} redirects`);
}

export async function readResponseText(response, maximumBytes) {
  const chunks = [];
  let length = 0;
  for await (const chunk of Readable.fromWeb(response.body)) {
    length += chunk.length;
    if (length > maximumBytes) fail("DOWNLOAD_FAILURE", `HTML landing page exceeds ${maximumBytes} bytes`);
    chunks.push(chunk);
  }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, length)); } catch {
    fail("DOWNLOAD_FAILURE", "HTML landing page is not valid UTF-8");
  }
}

export async function saveResponse(response, destination, expectedIdentity) {
  const declaredLength = response.headers.get("content-length");
  if (expectedIdentity && declaredLength !== null && Number(declaredLength) !== expectedIdentity.size) {
    fail("DOWNLOAD_INTEGRITY_FAILURE", `Downloaded ZIP Content-Length is ${declaredLength}, expected ${expectedIdentity.size}`);
  }
  const hash = expectedIdentity ? createHash("sha256") : undefined;
  let length = 0;
  const verifier = new Transform({
    transform(chunk, _encoding, callback) {
      length += chunk.length;
      if (expectedIdentity && length > expectedIdentity.size) {
        callback(new ImportFailure("DOWNLOAD_INTEGRITY_FAILURE", "Downloaded ZIP exceeds the pinned size"));
        return;
      }
      hash?.update(chunk);
      callback(null, chunk);
    },
  });
  try { await pipeline(Readable.fromWeb(response.body), verifier, createWriteStream(destination, { flags: "wx" })); } catch (error) {
    if (error instanceof ImportFailure) throw error;
    fail("DOWNLOAD_FAILURE", `Cannot save downloaded archive: ${error.message}`);
  }
  if (expectedIdentity) {
    const digest = hash.digest("hex");
    if (length !== expectedIdentity.size || digest !== expectedIdentity.sha256) {
      fail("DOWNLOAD_INTEGRITY_FAILURE", `Downloaded ZIP identity mismatch (${length} bytes, SHA-256 ${digest})`);
    }
  }
}

export async function downloadArchive(url, destination, fetchImpl = fetch) {
  const { response } = await fetchFollowingRedirects(url, {
    fetchImpl,
    headers: { "user-agent": "LoomRealm fixture importer" },
  });
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const disposition = response.headers.get("content-disposition")?.toLowerCase() ?? "";
  if (contentType.includes("text/html") || (!contentType.includes("zip") && !contentType.includes("octet-stream") && !disposition.includes(".zip"))) {
    fail("DOWNLOAD_FAILURE", "Download endpoint did not return a ZIP archive");
  }
  await saveResponse(response, destination);
}
