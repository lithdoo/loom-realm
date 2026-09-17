import type { RendererDataPeer } from "@loomrealm/data";
import type { RendererViewportLogicalSample } from "../viewport.js";

export function normalizeViewportSample(
  sample: RendererViewportLogicalSample,
): { readonly width: number; readonly height: number } | null {
  if (sample === null || typeof sample !== "object") return null;
  let rawWidth: unknown;
  let rawHeight: unknown;
  try {
    rawWidth = (sample as { width?: unknown }).width;
    rawHeight = (sample as { height?: unknown }).height;
  } catch {
    return null;
  }
  if (typeof rawWidth !== "number" || typeof rawHeight !== "number") return null;
  if (!Number.isFinite(rawWidth) || !Number.isFinite(rawHeight)) return null;
  if (rawWidth <= 0 || rawHeight <= 0) return null;
  const width = Math.floor(rawWidth);
  const height = Math.floor(rawHeight);
  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) {
    return null;
  }
  return Object.freeze({ width, height });
}

export class RendererViewportPublisher {
  private lastLegal: { readonly width: number; readonly height: number } | null = null;
  private readonly peers = new Set<RendererDataPeer>();

  observe(sample: RendererViewportLogicalSample): void {
    const size = normalizeViewportSample(sample);
    if (size === null) return;
    if (
      this.lastLegal !== null &&
      this.lastLegal.width === size.width &&
      this.lastLegal.height === size.height
    ) {
      return;
    }
    this.lastLegal = size;
    for (const peer of this.peers) this.send(peer, size);
  }

  attach(peer: RendererDataPeer): void {
    this.peers.add(peer);
    if (this.lastLegal !== null) this.send(peer, this.lastLegal);
  }

  detach(peer: RendererDataPeer): void {
    this.peers.delete(peer);
  }

  clear(): void {
    this.peers.clear();
    this.lastLegal = null;
  }

  private send(
    peer: RendererDataPeer,
    size: { readonly width: number; readonly height: number },
  ): void {
    void peer.viewport.sendState({
      type: "viewport.state",
      width: size.width,
      height: size.height,
    });
  }
}
