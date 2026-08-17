import { fail } from "../errors.mjs";
import { fetchFollowingRedirects, readResponseText, saveResponse } from "./download.mjs";

export const EEVEE_EXPO_DOWNLOAD = "https://www.eeveeexpo.com/essentials/download";
export const OFFICIAL_ARCHIVE_IDENTITY = Object.freeze({
  size: 61_987_094,
  sha256: "da0a34ec81ed40a4346fe6101debd7d938cbeadd43ff0aad87c3e388392a1665",
});

const MAX_LANDING_PAGE_BYTES = 2 * 1024 * 1024;

function decodeHtmlAttribute(value) {
  return value.replace(/&(?:amp|quot|apos|#39|#x27);/gi, (entity) => {
    const normalized = entity.toLowerCase();
    if (normalized === "&amp;") return "&";
    if (normalized === "&quot;") return '"';
    return "'";
  });
}

function htmlAttribute(tag, name) {
  const match = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "is").exec(tag);
  return match ? decodeHtmlAttribute(match[2]) : undefined;
}

export function isMediaFireUrl(url) {
  const parsed = url instanceof URL ? url : new URL(url);
  const host = parsed.hostname.toLowerCase();
  return parsed.protocol === "https:" && (host === "mediafire.com" || host.endsWith(".mediafire.com"));
}

export function resolveMediaFireDownloadLink(html, landingUrl) {
  const landing = new URL(landingUrl);
  if (!isMediaFireUrl(landing)) fail("DOWNLOAD_FAILURE", "Refusing to parse a non-MediaFire landing page");
  const candidates = [];
  for (const match of html.matchAll(/<a\b[^>]*>/gis)) {
    const tag = match[0];
    const href = htmlAttribute(tag, "href");
    if (!href) continue;
    let target;
    try { target = new URL(href, landing); } catch { continue; }
    let path;
    try { path = decodeURIComponent(target.pathname); } catch { continue; }
    if (!isMediaFireUrl(target) || !path.toLowerCase().endsWith(".zip")) continue;
    candidates.push({ url: target.href, preferred: htmlAttribute(tag, "id")?.toLowerCase() === "downloadbutton" });
  }
  const preferred = [...new Set(candidates.filter((item) => item.preferred).map((item) => item.url))];
  const all = [...new Set(candidates.map((item) => item.url))];
  const selected = preferred.length === 1 ? preferred[0] : all.length === 1 ? all[0] : undefined;
  if (!selected) fail("DOWNLOAD_FAILURE", `MediaFire landing page exposed ${all.length} acceptable HTTPS ZIP links`);
  return new URL(selected);
}

export async function downloadEeveeExpoArchive(destination, dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const browserHeaders = {
    accept: "text/html,application/xhtml+xml,application/zip;q=0.9,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.8",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36 LoomRealmFixtureImporter/1.0",
  };
  const landing = await fetchFollowingRedirects(EEVEE_EXPO_DOWNLOAD, { fetchImpl, headers: browserHeaders });
  const contentType = landing.response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("text/html")) fail("DOWNLOAD_FAILURE", "Eevee Expo acquisition did not resolve to the expected landing page");
  const html = await readResponseText(landing.response, MAX_LANDING_PAGE_BYTES);
  const downloadUrl = resolveMediaFireDownloadLink(html, landing.url);
  const archive = await fetchFollowingRedirects(downloadUrl, {
    fetchImpl,
    allowUrl: isMediaFireUrl,
    headers: {
      accept: "application/zip,application/octet-stream;q=0.9,*/*;q=0.8",
      referer: landing.url.href,
      "user-agent": browserHeaders["user-agent"],
    },
  });
  const archiveType = archive.response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!archiveType.includes("zip") && !archiveType.includes("octet-stream")) {
    fail("DOWNLOAD_FAILURE", `MediaFire download returned unsupported Content-Type: ${archiveType || "missing"}`);
  }
  await saveResponse(archive.response, destination, dependencies.expectedIdentity ?? OFFICIAL_ARCHIVE_IDENTITY);
}
