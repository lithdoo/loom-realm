(function registerLoomRealmMapElements() {
  "use strict";

  const AUTOTILE_TICK_MS = 50;
  const DEFAULT_AUTOTILE_FRAME_TICKS = 5;
  const VIEW_KEYS = [
    "sceneEpoch", "visualEpoch", "motionId", "viewportWidth", "viewportHeight",
    "mapId", "mapWidth", "mapHeight", "cameraX", "cameraY", "tileset", "autotiles",
    "tileVisuals", "chunks", "cameraMotion",
  ];
  const SPRITE_KEYS = [
    "sceneEpoch", "visualEpoch", "motionId", "x", "y", "screenX", "screenY",
    "direction", "pattern", "sprite", "motion",
  ];
  const RETRY_MS = [100, 200, 400];
  const CHUNK = 8;
  const CHUNK_CELLS = 192;
  const TILE = 32;
  const OVERSCAN = 1;
  const AUTOTILE_QUARTERS = [
    [27, 28, 33, 34], [5, 28, 33, 34], [27, 6, 33, 34], [5, 6, 33, 34],
    [27, 28, 33, 12], [5, 28, 33, 12], [27, 6, 33, 12], [5, 6, 33, 12],
    [27, 28, 11, 34], [5, 28, 11, 34], [27, 6, 11, 34], [5, 6, 11, 34],
    [27, 28, 11, 12], [5, 28, 11, 12], [27, 6, 11, 12], [5, 6, 11, 12],
    [25, 26, 31, 32], [25, 6, 31, 32], [25, 26, 31, 12], [25, 6, 31, 12],
    [15, 16, 21, 22], [15, 16, 21, 12], [15, 16, 11, 22], [15, 16, 11, 12],
    [29, 30, 35, 36], [29, 30, 11, 36], [5, 30, 35, 36], [5, 30, 11, 36],
    [39, 40, 45, 46], [5, 40, 45, 46], [39, 6, 45, 46], [5, 6, 45, 46],
    [25, 30, 31, 36], [15, 16, 45, 46], [13, 14, 19, 20], [13, 14, 19, 12],
    [17, 18, 23, 24], [17, 18, 11, 24], [41, 42, 47, 48], [5, 42, 47, 48],
    [37, 38, 43, 44], [37, 6, 43, 44], [13, 18, 19, 24], [13, 14, 43, 44],
    [37, 42, 43, 48], [17, 18, 47, 48], [13, 18, 43, 48], [1, 2, 7, 8],
  ];

  function resourceIdentity(ref) {
    return `${ref.namespace}\u0000${ref.key}\u0000${ref.contentVersion}`;
  }

  function tileStackValue(depth) {
    return depth * 2;
  }

  function characterStackValue(depth) {
    return depth * 2 + 1;
  }

  function lerp(from, to, progress) {
    return from + (to - from) * progress;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function qualify(name, detail) {
    const hook = globalThis.__loomrealmMovementQualification;
    if (typeof hook === "function") {
      try { hook({ name, at: performance.now(), detail }); } catch { /* qualification must not change product behavior */ }
    }
  }

  function fault(phase, detail) {
    const hook = globalThis.__loomrealmMapTestFault;
    if (typeof hook === "function") hook(phase, detail);
  }

  function exactObject(value, keys) {
    return Boolean(value) && typeof value === "object" && keys.every((key) => key in value) && Object.keys(value).length === keys.length;
  }

  function validRef(value) {
    return exactObject(value, ["namespace", "key", "contentVersion"])
      && [value.namespace, value.key, value.contentVersion].every((part) => typeof part === "string" && part.length > 0);
  }

  function validCameraMotion(value) {
    if (value === null) return true;
    if (!exactObject(value, ["id", "durationMs", "fromCameraX", "fromCameraY"])) return false;
    return Number.isSafeInteger(value.id) && value.id > 0
      && value.durationMs === 250
      && Number.isSafeInteger(value.fromCameraX) && value.fromCameraX >= 0
      && Number.isSafeInteger(value.fromCameraY) && value.fromCameraY >= 0;
  }

  function validPlayerMotion(value) {
    if (value === null) return true;
    if (!exactObject(value, ["id", "durationMs", "fromY", "fromScreenX", "fromScreenY"])) return false;
    return Number.isSafeInteger(value.id) && value.id > 0
      && value.durationMs === 250
      && Number.isSafeInteger(value.fromY) && value.fromY >= 0
      && Number.isFinite(value.fromScreenX)
      && Number.isFinite(value.fromScreenY);
  }

  function autotileCornerTuple(variant) {
    const row = AUTOTILE_QUARTERS[variant];
    if (!row) return null;
    return row.flatMap((quarter) => {
      const index = quarter - 1;
      return [(index % 6) * 16, Math.floor(index / 6) * 16];
    });
  }

  function tileBounds(cameraX, cameraY, vw, vh, mapWidth, mapHeight) {
    return {
      minTileX: Math.max(0, Math.floor(cameraX / TILE)),
      maxTileX: Math.min(mapWidth - 1, Math.floor((cameraX + vw - 1) / TILE)),
      minTileY: Math.max(0, Math.floor(cameraY / TILE)),
      maxTileY: Math.min(mapHeight - 1, Math.floor((cameraY + vh - 1) / TILE)),
    };
  }

  function unionBounds(left, right) {
    return {
      minTileX: Math.min(left.minTileX, right.minTileX),
      maxTileX: Math.max(left.maxTileX, right.maxTileX),
      minTileY: Math.min(left.minTileY, right.minTileY),
      maxTileY: Math.max(left.maxTileY, right.maxTileY),
    };
  }

  function expectedChunkCoords(bounds, mapWidth, mapHeight) {
    const minChunkX = Math.max(0, Math.floor(bounds.minTileX / CHUNK) - OVERSCAN);
    const maxChunkX = Math.min(Math.floor((mapWidth - 1) / CHUNK), Math.floor(bounds.maxTileX / CHUNK) + OVERSCAN);
    const minChunkY = Math.max(0, Math.floor(bounds.minTileY / CHUNK) - OVERSCAN);
    const maxChunkY = Math.min(Math.floor((mapHeight - 1) / CHUNK), Math.floor(bounds.maxTileY / CHUNK) + OVERSCAN);
    const coords = [];
    for (let chunkY = minChunkY; chunkY <= maxChunkY; chunkY += 1) {
      for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX += 1) {
        coords.push({ chunkX, chunkY });
      }
    }
    return coords;
  }

  function requiredBoundsForView(data) {
    const current = tileBounds(data.cameraX, data.cameraY, data.viewportWidth, data.viewportHeight, data.mapWidth, data.mapHeight);
    if (!data.cameraMotion) return current;
    return unionBounds(
      current,
      tileBounds(
        data.cameraMotion.fromCameraX,
        data.cameraMotion.fromCameraY,
        data.viewportWidth,
        data.viewportHeight,
        data.mapWidth,
        data.mapHeight,
      ),
    );
  }

  function validTileVisual(visual, autotiles) {
    if (!Array.isArray(visual)) return false;
    const tileId = visual[0];
    if (!Number.isSafeInteger(tileId) || tileId <= 0) return false;
    if (tileId >= 1 && tileId <= 47) return false;
    if (!Number.isSafeInteger(visual[1])) return false;
    if (visual[2] === 0) {
      return visual.length === 4
        && tileId >= 384
        && Number.isSafeInteger(visual[3])
        && visual[3] === tileId - 384;
    }
    if (visual[2] !== 1 || visual.length !== 12) return false;
    if (tileId < 48 || tileId > 383) return false;
    const slot = Math.floor((tileId - 48) / 48);
    const variant = (tileId - 48) % 48;
    if (visual[3] !== slot || slot < 0 || slot > 6) return false;
    if (!validRef(autotiles[slot])) return false;
    const expected = autotileCornerTuple(variant);
    if (!expected) return false;
    for (let index = 0; index < 8; index += 1) {
      if (visual[4 + index] !== expected[index]) return false;
    }
    return true;
  }

  function validChunk(chunk) {
    return exactObject(chunk, ["chunkX", "chunkY", "cells"])
      && Number.isSafeInteger(chunk.chunkX) && chunk.chunkX >= 0
      && Number.isSafeInteger(chunk.chunkY) && chunk.chunkY >= 0
      && Array.isArray(chunk.cells) && chunk.cells.length === CHUNK_CELLS
      && chunk.cells.every((cell) => Number.isSafeInteger(cell) && cell >= 0);
  }

  function assertMapViewData(data) {
    if (
      !exactObject(data, VIEW_KEYS)
      || !Number.isSafeInteger(data.sceneEpoch) || data.sceneEpoch <= 0
      || !Number.isSafeInteger(data.visualEpoch) || data.visualEpoch <= 0
      || !(data.motionId === null || (Number.isSafeInteger(data.motionId) && data.motionId > 0))
      || !Number.isSafeInteger(data.viewportWidth) || data.viewportWidth <= 0
      || !Number.isSafeInteger(data.viewportHeight) || data.viewportHeight <= 0
      || !Number.isSafeInteger(data.mapId) || data.mapId <= 0
      || !Number.isSafeInteger(data.mapWidth) || data.mapWidth <= 0
      || !Number.isSafeInteger(data.mapHeight) || data.mapHeight <= 0
      || !Number.isSafeInteger(data.cameraX) || data.cameraX < 0
      || !Number.isSafeInteger(data.cameraY) || data.cameraY < 0
      || !validRef(data.tileset)
      || !Array.isArray(data.autotiles) || data.autotiles.length !== 7
      || !data.autotiles.every((item) => item === null || validRef(item))
      || !Array.isArray(data.tileVisuals)
      || !Array.isArray(data.chunks)
      || !validCameraMotion(data.cameraMotion)
      || (data.cameraMotion === null) !== (data.motionId === null)
      || (data.cameraMotion !== null && data.cameraMotion.id !== data.motionId)
    ) throw new TypeError("Invalid MapViewRenderData");
    const maxCameraX = Math.max(data.mapWidth * TILE - data.viewportWidth, 0);
    const maxCameraY = Math.max(data.mapHeight * TILE - data.viewportHeight, 0);
    if (data.cameraX > maxCameraX || data.cameraY > maxCameraY) throw new TypeError("Invalid MapViewRenderData");
    const expected = expectedChunkCoords(requiredBoundsForView(data), data.mapWidth, data.mapHeight);
    if (data.chunks.length !== expected.length) throw new TypeError("Invalid MapViewRenderData");
    const seenChunks = new Set();
    const usedIds = new Set();
    for (let index = 0; index < data.chunks.length; index += 1) {
      const chunk = data.chunks[index];
      const want = expected[index];
      if (!validChunk(chunk) || chunk.chunkX !== want.chunkX || chunk.chunkY !== want.chunkY) {
        throw new TypeError("Invalid MapViewRenderData");
      }
      const key = `${chunk.chunkX},${chunk.chunkY}`;
      if (seenChunks.has(key)) throw new TypeError("Invalid MapViewRenderData");
      seenChunks.add(key);
      if (index > 0) {
        const previous = data.chunks[index - 1];
        if (chunk.chunkY < previous.chunkY || (chunk.chunkY === previous.chunkY && chunk.chunkX <= previous.chunkX)) {
          throw new TypeError("Invalid MapViewRenderData");
        }
      }
      for (const cell of chunk.cells) {
        if (cell === 0) continue;
        if (cell >= 1 && cell <= 47) throw new TypeError("Invalid MapViewRenderData");
        usedIds.add(cell);
      }
    }
    const seenVisuals = new Set();
    let lastTileId = 0;
    for (const visual of data.tileVisuals) {
      if (!validTileVisual(visual, data.autotiles)) throw new TypeError("Invalid MapViewRenderData");
      if (visual[0] <= lastTileId) throw new TypeError("Invalid MapViewRenderData");
      lastTileId = visual[0];
      if (seenVisuals.has(visual[0])) throw new TypeError("Invalid MapViewRenderData");
      seenVisuals.add(visual[0]);
    }
    if (seenVisuals.size !== usedIds.size) throw new TypeError("Invalid MapViewRenderData");
    for (const tileId of usedIds) {
      if (!seenVisuals.has(tileId)) throw new TypeError("Invalid MapViewRenderData");
    }
  }

  function assertMapSpriteData(data) {
    if (
      !exactObject(data, SPRITE_KEYS)
      || !Number.isSafeInteger(data.sceneEpoch) || data.sceneEpoch <= 0
      || !Number.isSafeInteger(data.visualEpoch) || data.visualEpoch <= 0
      || !(data.motionId === null || (Number.isSafeInteger(data.motionId) && data.motionId > 0))
      || !Number.isSafeInteger(data.x) || data.x < 0
      || !Number.isSafeInteger(data.y) || data.y < 0
      || ![2, 4, 6, 8].includes(data.direction)
      || ![0, 1, 2, 3].includes(data.pattern)
      || !Number.isFinite(data.screenX)
      || !Number.isFinite(data.screenY)
      || !validRef(data.sprite)
      || !validPlayerMotion(data.motion)
      || (data.motion === null && data.pattern !== 0)
      || (data.motion !== null && data.pattern !== 1 && data.pattern !== 3)
      || (data.motion === null) !== (data.motionId === null)
      || (data.motion !== null && data.motion.id !== data.motionId)
    ) throw new TypeError("Invalid MapSpriteRenderData");
  }

  function classifyAutotileLayout(image) {
    if (image.height === 128 && image.width >= 96 && image.width % 96 === 0) return "block";
    if (image.height === 32 && image.width >= 32 && image.width % 32 === 0) return "cell";
    return "invalid";
  }

  function autotileFrameDurationMs(ref) {
    const name = ref.key.slice(ref.key.lastIndexOf("/") + 1);
    const match = /\[\s*(\d+)\s*\]\s*$/.exec(name);
    if (!match) return DEFAULT_AUTOTILE_FRAME_TICKS * AUTOTILE_TICK_MS;
    const ticks = Number(match[1]);
    if (!Number.isSafeInteger(ticks) || ticks <= 0) return null;
    return ticks * AUTOTILE_TICK_MS;
  }

  function autotileFrameIndex(now, startedAt, frameCount, durationMs) {
    if (frameCount <= 1) return 0;
    return Math.floor((now - startedAt) / durationMs) % frameCount;
  }

  function tileDepth(y, visual) {
    return visual[1] === -1 ? 0 : y * 32 + visual[1];
  }

  function expandTiles(data) {
    const visuals = new Map();
    for (const visual of data.tileVisuals) visuals.set(visual[0], visual);
    const tiles = [];
    for (const chunk of data.chunks) {
      for (let z = 0; z < 3; z += 1) {
        for (let localY = 0; localY < CHUNK; localY += 1) {
          for (let localX = 0; localX < CHUNK; localX += 1) {
            const tileId = chunk.cells[((z * CHUNK + localY) * CHUNK) + localX];
            if (tileId === 0) continue;
            const visual = visuals.get(tileId);
            if (!visual) throw new TypeError("Invalid MapViewRenderData");
            tiles.push({
              x: chunk.chunkX * CHUNK + localX,
              y: chunk.chunkY * CHUNK + localY,
              z,
              tileId,
              visual,
              depth: tileDepth(chunk.chunkY * CHUNK + localY, visual),
            });
          }
        }
      }
    }
    tiles.sort((left, right) => left.z - right.z || left.y - right.y || left.x - right.x);
    return tiles;
  }

  function bucketTiles(tiles) {
    const buckets = new Map();
    for (const tile of tiles) {
      let list = buckets.get(tile.depth);
      if (!list) {
        list = [];
        buckets.set(tile.depth, list);
      }
      list.push(tile);
    }
    return buckets;
  }

  function depthBounds(tiles) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const tile of tiles) {
      minX = Math.min(minX, tile.x * 32);
      minY = Math.min(minY, tile.y * 32);
      maxX = Math.max(maxX, tile.x * 32 + 32);
      maxY = Math.max(maxY, tile.y * 32 + 32);
    }
    return { minX, minY, width: maxX - minX, height: maxY - minY };
  }

  function usedResources(data, tiles) {
    const uniqueRefs = new Map();
    const usedSlots = [];
    const seenSlots = new Set();
    let needsTileset = false;
    for (const tile of tiles) {
      if (tile.visual[2] === 0) {
        needsTileset = true;
        continue;
      }
      const slot = tile.visual[3];
      const ref = data.autotiles[slot];
      if (!seenSlots.has(slot)) {
        seenSlots.add(slot);
        usedSlots.push({ slot, ref });
      }
      uniqueRefs.set(resourceIdentity(ref), ref);
    }
    if (needsTileset) uniqueRefs.set(resourceIdentity(data.tileset), data.tileset);
    return { uniqueRefs, usedSlots, needsTileset };
  }

  function tokensEqual(view, sprite) {
    return view.sceneEpoch === sprite.sceneEpoch
      && view.visualEpoch === sprite.visualEpoch
      && view.motionId === sprite.motionId;
  }

  function motionFingerprint(view, sprite) {
    if (view.cameraMotion === null && sprite.motion === null) return null;
    return JSON.stringify([
      view.motionId,
      view.cameraMotion,
      sprite.motion,
      view.cameraX,
      view.cameraY,
      sprite.x,
      sprite.y,
      sprite.screenX,
      sprite.screenY,
      sprite.direction,
      sprite.pattern,
    ]);
  }

  function autotileIdentitiesEqual(left, right) {
    if (left === right) return true;
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      const a = left[index];
      const b = right[index];
      if (a === b) continue;
      if (!a || !b) return false;
      if (resourceIdentity(a) !== resourceIdentity(b)) return false;
    }
    return true;
  }

  function sameProjectedTile(left, right) {
    if (!left || !right || left.tileId !== right.tileId) return false;
    if (left.visual === right.visual) return true;
    if (!left.visual || !right.visual || left.visual.length !== right.visual.length) return false;
    for (let index = 0; index < left.visual.length; index += 1) {
      if (left.visual[index] !== right.visual[index]) return false;
    }
    return true;
  }

  function overlapWorld(prev, next) {
    const x0 = Math.max(prev.worldX, next.worldX);
    const y0 = Math.max(prev.worldY, next.worldY);
    const x1 = Math.min(prev.worldX + prev.canvas.width, next.worldX + next.canvas.width);
    const y1 = Math.min(prev.worldY + prev.canvas.height, next.worldY + next.canvas.height);
    if (x1 <= x0 || y1 <= y0) return null;
    return { x0, y0, x1, y1 };
  }

  function tileInsideOverlap(tile, overlap) {
    if (!overlap) return false;
    const tx = tile.x * 32;
    const ty = tile.y * 32;
    return tx >= overlap.x0 && ty >= overlap.y0 && tx + 32 <= overlap.x1 && ty + 32 <= overlap.y1;
  }

  class ResourceHost extends HTMLElement {
    constructor() {
      super();
      this._resources = undefined;
      this._images = new Map();
      this._bitmaps = new Map();
      this._owners = new Map();
    }

    receiveRenderContext(context) {
      if (!context || !context.resources || typeof context.resources.resource !== "function") throw new TypeError("Map presentation requires PresentationResourceClient");
      this._resources = context.resources;
    }

    _own(identity, owner) {
      let owners = this._owners.get(identity);
      if (!owners) {
        owners = new Set();
        this._owners.set(identity, owners);
      }
      owners.add(owner);
    }

    _disown(owner) {
      for (const [identity, owners] of [...this._owners]) {
        if (!owners.delete(owner)) continue;
        if (owners.size === 0) this._release(identity);
      }
    }

    _release(identity) {
      this._owners.delete(identity);
      const bitmap = this._bitmaps.get(identity);
      this._bitmaps.delete(identity);
      this._images.delete(identity);
      if (bitmap && typeof bitmap.close === "function") {
        try { bitmap.close(); } catch { /* already closed */ }
      }
    }

    _releaseAll() {
      for (const identity of [...this._owners.keys()]) this._release(identity);
      this._images.clear();
    }

    async _image(ref) {
      if (!validRef(ref)) throw new TypeError("Invalid map resource reference");
      if (!this._resources) throw new TypeError("Map presentation has no resource context");
      const identity = resourceIdentity(ref);
      let pending = this._images.get(identity);
      if (!pending) {
        pending = (async () => {
          const resource = await this._resources.resource(ref.namespace, ref.key, ref.contentVersion);
          if (resource.mime !== "image/png") throw new TypeError("M14 map resources must be image/png");
          const bitmap = await createImageBitmap(new Blob([resource.bytes], { type: resource.mime }));
          if (this._images.get(identity) !== pending) {
            if (typeof bitmap.close === "function") {
              try { bitmap.close(); } catch { /* stale */ }
            }
            throw new TypeError("stale map image decode");
          }
          const owners = this._owners.get(identity);
          if (!owners || owners.size === 0) {
            if (typeof bitmap.close === "function") {
              try { bitmap.close(); } catch { /* unowned */ }
            }
            this._images.delete(identity);
            throw new TypeError("unowned map image decode");
          }
          this._bitmaps.set(identity, bitmap);
          return bitmap;
        })();
        this._images.set(identity, pending);
        pending.catch(() => {
          if (this._images.get(identity) === pending) this._images.delete(identity);
        });
      }
      return pending;
    }
  }

  class LoomRealmMapView extends ResourceHost {
    constructor() {
      super();
      const shadow = this.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = ":host{display:block;position:relative;overflow:hidden;width:640px;height:480px}canvas.tile-layer{position:absolute;display:block;image-rendering:pixelated;pointer-events:none}canvas.tile-layer[hidden]{display:none}slot{display:contents}::slotted(lr-map-sprite){display:block;position:absolute;image-rendering:pixelated;pointer-events:none}";
      this._style = style;
      this._layers = [];
      this._slot = document.createElement("slot");
      shadow.append(style, this._slot);
      this._animationStartedAt = performance.now();
      this._sequence = 0;
      this._desiredView = undefined;
      this._desiredSprite = undefined;
      this._accepted = undefined;
      this._raf = undefined;
      this._retry = undefined;
      this._retryAttempts = 0;
      this._activeMotion = null;
      this._latestData = undefined;
      this._lastPaintedCamera = undefined;
      this._paintEpoch = 0;
      this._state = "EMPTY";
      this._tileDrawCount = 0;
      this._tileClearCount = 0;
      this._tileResizeCount = 0;
      this._cameraOnlyCommits = 0;
      this._acceptedIds = new Set();
    }

    _hostRule() {
      const sheet = this._style.sheet;
      if (!sheet) return undefined;
      return [...sheet.cssRules].find((rule) => rule.selectorText === ":host");
    }

    _applyViewportBox(width, height) {
      const rule = this._hostRule();
      if (!rule) return;
      rule.style.width = `${width}px`;
      rule.style.height = `${height}px`;
    }

    _spriteRule() {
      const sheet = this._style.sheet;
      if (!sheet) return undefined;
      return [...sheet.cssRules].find((rule) => rule.selectorText && rule.selectorText.includes("lr-map-sprite"));
    }

    _cancelRaf() {
      if (this._raf !== undefined) {
        cancelAnimationFrame(this._raf);
        this._raf = undefined;
      }
      const sprite = this._spriteChild();
      if (sprite) sprite._raf = undefined;
    }

    _cancelRetry() {
      if (this._retry !== undefined) {
        clearTimeout(this._retry);
        this._retry = undefined;
      }
    }

    _spriteChild() {
      const assigned = this._slot.assignedElements ? this._slot.assignedElements() : [...this.children];
      return assigned.find((node) => node.tagName === "LR-MAP-SPRITE");
    }

    _candidateOwner(sequence) {
      return `c:${sequence}`;
    }

    disconnectedCallback() {
      queueMicrotask(() => {
        if (!this.isConnected) {
          this._sequence += 1;
          this._cancelRaf();
          this._cancelRetry();
          this._activeMotion = null;
          this._state = "DISPOSED";
          this._releaseAll();
          const sprite = this._desiredSprite?.sprite;
          if (sprite && typeof sprite._releaseAll === "function") sprite._releaseAll();
        }
      });
    }

    receiveRenderData(data) {
      assertMapViewData(data);
      this._latestData = data;
      this._desiredView = { data, receivedAt: performance.now() };
      this._sequence += 1;
      this._paintEpoch = this._sequence;
      this._cancelRetry();
      this._retryAttempts = 0;
      this._disown(this._candidateOwner(this._sequence - 1));
      qualify("presentation-received", { element: "map-view", motionId: data.motionId });
      void this._prepare(this._sequence);
    }

    _receiveSprite(sprite, data, receivedAt) {
      this._desiredSprite = { sprite, data, receivedAt };
      this._sequence += 1;
      this._paintEpoch = this._sequence;
      this._cancelRetry();
      this._retryAttempts = 0;
      this._disown(this._candidateOwner(this._sequence - 1));
      void this._prepare(this._sequence);
    }

    async _prepare(sequence) {
      const view = this._desiredView;
      if (!view || sequence !== this._sequence || !this.isConnected) return;
      const spriteChild = this._spriteChild();
      const sprite = this._desiredSprite && this._desiredSprite.sprite === spriteChild ? this._desiredSprite : undefined;
      if (spriteChild) {
        if (!sprite) return;
        if (!tokensEqual(view.data, sprite.data)) return;
      }
      if (sprite && ((view.data.cameraMotion === null) !== (sprite.data.motion === null) || view.data.motionId !== sprite.data.motionId)) {
        throw new TypeError("Invalid map motion identity");
      }
      this._state = "PREPARING";
      if (
        this._accepted
        && this._accepted.view.sceneEpoch === view.data.sceneEpoch
        && this._accepted.view.visualEpoch === view.data.visualEpoch
        && this._accepted.view.chunks === view.data.chunks
        && this._accepted.view.tileVisuals === view.data.tileVisuals
        && resourceIdentity(this._accepted.view.tileset) === resourceIdentity(view.data.tileset)
      ) {
        const prepared = {
          ...this._accepted,
          view: view.data,
          sprite: sprite?.data ?? this._accepted.sprite,
          pairReceivedAt: sprite ? Math.min(view.receivedAt, sprite.receivedAt) : view.receivedAt,
          layers: this._layers,
        };
        this._cameraOnlyCommits += 1;
        this._commitMotion(prepared, sequence);
        this._accepted = prepared;
        this._state = "VISIBLE";
        this._cancelRaf();
        this._tickAccepted(prepared, sequence, false);
        return;
      }
      const owner = this._candidateOwner(sequence);
      let tiles;
      try {
        tiles = expandTiles(view.data);
      } catch {
        this._failPrepare(sequence);
        return;
      }
      const resources = usedResources(view.data, tiles);
      for (const { ref } of resources.usedSlots) {
        if (autotileFrameDurationMs(ref) === null) {
          this._failPrepare(sequence);
          return;
        }
      }
      let decoded = new Map();
      try {
        for (const identity of resources.uniqueRefs.keys()) this._own(identity, owner);
        if (resources.uniqueRefs.size > 0) {
          decoded = new Map(await Promise.all([...resources.uniqueRefs.entries()].map(async ([identity, ref]) => [identity, await this._image(ref)])));
        }
        if (sprite) {
          const spriteId = resourceIdentity(sprite.data.sprite);
          sprite.sprite._own(spriteId, owner);
          decoded.set(spriteId, await sprite.sprite._image(sprite.data.sprite));
        }
      } catch {
        this._disown(owner);
        if (sprite) sprite.sprite._disown(owner);
        this._failPrepare(sequence);
        return;
      }
      if (sequence !== this._sequence || !this.isConnected || this._desiredView !== view) {
        this._disown(owner);
        if (sprite) sprite.sprite._disown(owner);
        return;
      }
      const autotiles = new Map();
      for (const { slot, ref } of resources.usedSlots) {
        const image = decoded.get(resourceIdentity(ref));
        const layout = classifyAutotileLayout(image);
        const durationMs = autotileFrameDurationMs(ref);
        if (layout === "invalid" || durationMs === null) {
          this._disown(owner);
          if (sprite) sprite.sprite._disown(owner);
          this._failPrepare(sequence);
          return;
        }
        const frameWidth = layout === "block" ? 96 : 32;
        autotiles.set(slot, { image, layout, frameCount: image.width / frameWidth, frameWidth, durationMs });
      }
      const prepared = {
        tilesetImage: resources.needsTileset ? decoded.get(resourceIdentity(view.data.tileset)) : undefined,
        autotiles,
        buckets: bucketTiles(tiles),
        view: view.data,
        sprite: sprite?.data,
        spriteImage: sprite ? decoded.get(resourceIdentity(sprite.data.sprite)) : undefined,
        pairReceivedAt: sprite ? Math.min(view.receivedAt, sprite.receivedAt) : view.receivedAt,
        resourceIds: new Set(resources.uniqueRefs.keys()),
        spriteResourceId: sprite ? resourceIdentity(sprite.data.sprite) : null,
        spriteEl: sprite?.sprite,
        owner,
      };
      try {
        prepared.layers = this._rasterDetached(prepared, sequence);
        if (sprite) prepared.spriteCanvas = this._rasterSpriteDetached(prepared);
      } catch {
        this._disown(owner);
        if (sprite) sprite.sprite._disown(owner);
        this._failPrepare(sequence);
        return;
      }
      if (sequence !== this._sequence || !this.isConnected || this._desiredView !== view) {
        this._disown(owner);
        if (sprite) sprite.sprite._disown(owner);
        return;
      }
      this._commitAtomic(prepared, sequence);
    }

    _failPrepare(sequence) {
      if (sequence !== this._sequence) return;
      this._cancelRaf();
      if (!this._accepted) this._state = "EMPTY";
      else this._state = "VISIBLE";
      if (this._retryAttempts >= RETRY_MS.length) {
        qualify("map-prepare-exhausted", { element: "map-view" });
        return;
      }
      const delay = RETRY_MS[this._retryAttempts];
      this._retryAttempts += 1;
      this._state = "RETRY_WAIT";
      this._retry = setTimeout(() => {
        this._retry = undefined;
        void this._prepare(this._sequence);
      }, delay);
    }

    _makeLayer(depth, bounds) {
      const canvas = document.createElement("canvas");
      canvas.className = "tile-layer";
      this._tileResizeCount += 1;
      canvas.width = Math.max(1, bounds.width);
      canvas.height = Math.max(1, bounds.height);
      const context = canvas.getContext("2d", { alpha: true });
      context.imageSmoothingEnabled = false;
      return { canvas, context, worldX: bounds.minX, worldY: bounds.minY, depth };
    }

    _rasterDetached(prepared, sequence) {
      const now = performance.now();
      const frames = new Map();
      for (const [slot, item] of prepared.autotiles.entries()) {
        frames.set(slot, autotileFrameIndex(now, this._animationStartedAt, item.frameCount, item.durationMs));
      }
      const groups = [...prepared.buckets.entries()].sort(([left], [right]) => left - right);
      const previousByDepth = new Map();
      const previousTiles = new Map();
      const sameScene = Boolean(
        this._accepted
        && this._accepted.view.sceneEpoch === prepared.view.sceneEpoch
        && resourceIdentity(this._accepted.view.tileset) === resourceIdentity(prepared.view.tileset)
        && autotileIdentitiesEqual(this._accepted.view.autotiles, prepared.view.autotiles),
      );
      if (sameScene) {
        for (const layer of this._layers) previousByDepth.set(layer.depth, layer);
        for (const tiles of this._accepted.buckets.values()) {
          for (const tile of tiles) previousTiles.set(`${tile.depth}:${tile.x}:${tile.y}`, tile);
        }
      }
      const layers = [];
      for (let index = 0; index < groups.length; index += 1) {
        const [depth, tiles] = groups[index];
        const bounds = depthBounds(tiles);
        const layer = this._makeLayer(depth, bounds);
        const previous = previousByDepth.get(depth);
        let copied = null;
        if (previous && previous.canvas.width > 0 && previous.canvas.height > 0) {
          copied = overlapWorld(previous, layer);
          if (copied) {
            layer.context.drawImage(
              previous.canvas,
              copied.x0 - previous.worldX,
              copied.y0 - previous.worldY,
              copied.x1 - copied.x0,
              copied.y1 - copied.y0,
              copied.x0 - layer.worldX,
              copied.y0 - layer.worldY,
              copied.x1 - copied.x0,
              copied.y1 - copied.y0,
            );
          }
        }
        for (const tile of tiles) {
          fault("draw", { sequence, index, depth, tile, connected: layer.canvas.isConnected, hostHasCanvas: this.shadowRoot.contains(layer.canvas) });
          const previousTile = previousTiles.get(`${depth}:${tile.x}:${tile.y}`);
          if (copied && tileInsideOverlap(tile, copied) && tile.visual[2] !== 1 && sameProjectedTile(previousTile, tile)) continue;
          if (copied && tileInsideOverlap(tile, copied) && tile.visual[2] === 1) {
            const dx = tile.x * 32 - layer.worldX;
            const dy = tile.y * 32 - layer.worldY;
            layer.context.clearRect(dx, dy, 32, 32);
          }
          this._blitTile(layer, tile, prepared, frames);
        }
        layer.frames = frames;
        layers.push(layer);
      }
      return layers;
    }

    _rasterSpriteDetached(prepared) {
      const sprite = prepared.spriteEl;
      const image = prepared.spriteImage;
      const data = prepared.sprite;
      if (!sprite || !image || !data) return undefined;
      const motion = data.motion;
      const now = performance.now();
      const active = this._activeMotion;
      const duration = active?.durationMs ?? motion?.durationMs ?? 250;
      const progress = active && motion ? clamp((now - active.startedAt) / duration, 0, 1) : 1;
      const pattern = motion ? (progress < 0.5 ? data.pattern : (data.pattern + 1) % 4) : 0;
      const canvas = document.createElement("canvas");
      const frameWidth = image.width / 4;
      const frameHeight = image.height / 4;
      if (!Number.isInteger(frameWidth) || !Number.isInteger(frameHeight)) throw new TypeError("Character sheet must be 4 by 4");
      canvas.width = frameWidth;
      canvas.height = frameHeight;
      const context = canvas.getContext("2d", { alpha: true });
      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, frameWidth, frameHeight);
      context.drawImage(image, pattern * frameWidth, ((data.direction - 2) / 2) * frameHeight, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);
      return { canvas, width: frameWidth, height: frameHeight, key: `${resourceIdentity(data.sprite)}|${data.direction}|${pattern}|${frameWidth}x${frameHeight}` };
    }

    _promoteResources(prepared) {
      const nextIds = prepared.resourceIds ?? new Set();
      for (const identity of nextIds) this._own(identity, "accepted");
      for (const identity of [...this._acceptedIds]) {
        if (nextIds.has(identity)) continue;
        const owners = this._owners.get(identity);
        owners?.delete("accepted");
        if (!owners || owners.size === 0) {
          this._release(identity);
          this._images.delete(identity);
        }
      }
      this._acceptedIds = nextIds;
      this._disown(prepared.owner);
      const sprite = prepared.spriteEl;
      if (sprite && prepared.spriteResourceId) {
        sprite._own(prepared.spriteResourceId, "accepted");
        for (const identity of [...(sprite._acceptedIds ?? [])]) {
          if (identity === prepared.spriteResourceId) continue;
          const owners = sprite._owners.get(identity);
          owners?.delete("accepted");
          if (!owners || owners.size === 0) {
            sprite._release(identity);
            sprite._images.delete(identity);
          }
        }
        sprite._acceptedIds = new Set([prepared.spriteResourceId]);
        sprite._disown(prepared.owner);
      }
    }

    _commitAtomic(prepared, sequence) {
      if (sequence !== this._sequence || !this.isConnected) {
        this._disown(prepared.owner);
        prepared.spriteEl?._disown(prepared.owner);
        return;
      }
      this._commitMotion(prepared, sequence);
      const incoming = prepared.layers;
      const outgoing = this._layers.slice();
      for (const layer of outgoing) {
        layer.canvas.hidden = true;
        layer.canvas.remove();
      }
      for (const layer of incoming) {
        layer.canvas.hidden = false;
        this.shadowRoot.insertBefore(layer.canvas, this._slot);
      }
      this._layers = incoming;
      if (prepared.spriteCanvas && prepared.spriteEl) {
        prepared.spriteEl._installCanvas(prepared.spriteCanvas.canvas, prepared.spriteCanvas.key);
      }
      this._promoteResources(prepared);
      this._accepted = prepared;
      this._state = "VISIBLE";
      this._cancelRaf();
      this._tickAccepted(prepared, sequence, true);
    }

    _commitMotion(prepared, sequence) {
      const fingerprint = prepared.sprite ? motionFingerprint(prepared.view, prepared.sprite) : JSON.stringify([prepared.view.motionId, prepared.view.cameraMotion]);
      const now = performance.now();
      if (this._activeMotion && prepared.view.motionId === this._activeMotion.id && fingerprint !== this._activeMotion.fingerprint) {
        const previous = this._accepted;
        const sameVisual = previous
          && previous.view.visualEpoch === prepared.view.visualEpoch
          && previous.view.viewportWidth === prepared.view.viewportWidth
          && previous.view.viewportHeight === prepared.view.viewportHeight;
        if (sameVisual) throw new TypeError("Invalid map motion identity");
        const remaining = Math.max(0, this._activeMotion.startedAt + (this._activeMotion.durationMs ?? 250) - now);
        const visibleCamera = this._lastPaintedCamera;
        const visibleSprite = this._desiredSprite?.sprite?._lastPaintedScreen;
        if (prepared.view.cameraMotion && visibleCamera) {
          prepared.view = {
            ...prepared.view,
            cameraMotion: { ...prepared.view.cameraMotion, fromCameraX: visibleCamera.x, fromCameraY: visibleCamera.y },
          };
        }
        if (prepared.sprite?.motion && visibleSprite) {
          prepared.sprite = {
            ...prepared.sprite,
            motion: { ...prepared.sprite.motion, fromScreenX: visibleSprite.x, fromScreenY: visibleSprite.y },
          };
        }
        this._activeMotion = remaining === 0
          ? { id: prepared.view.motionId, fingerprint, startedAt: now - 250, durationMs: 250 }
          : { id: prepared.view.motionId, fingerprint, startedAt: now, durationMs: remaining };
      } else if (!this._activeMotion && prepared.view.motionId !== null) {
        this._activeMotion = { id: prepared.view.motionId, fingerprint, startedAt: prepared.pairReceivedAt, durationMs: 250 };
      } else if (prepared.view.motionId === null) {
        this._activeMotion = null;
      } else if (this._activeMotion && prepared.view.motionId !== this._activeMotion.id) {
        this._activeMotion = { id: prepared.view.motionId, fingerprint, startedAt: prepared.pairReceivedAt, durationMs: 250 };
      }
    }

    _tickAccepted(prepared, sequence, justCommitted) {
      if (sequence !== this._sequence || this._accepted !== prepared || !this.isConnected) return;
      const now = performance.now();
      const view = prepared.view;
      const sprite = prepared.sprite;
      const motion = view.cameraMotion;
      const active = this._activeMotion;
      const duration = active?.durationMs ?? motion?.durationMs ?? sprite?.motion?.durationMs ?? 250;
      const progress = active && (motion || sprite?.motion) ? clamp((now - active.startedAt) / duration, 0, 1) : 1;
      const cameraX = motion ? Math.round(lerp(motion.fromCameraX, view.cameraX, progress)) : view.cameraX;
      const cameraY = motion ? Math.round(lerp(motion.fromCameraY, view.cameraY, progress)) : view.cameraY;
      this._applyViewportBox(view.viewportWidth, view.viewportHeight);
      const frames = new Map();
      let hasAnimatedAutotile = false;
      for (const [slot, item] of prepared.autotiles.entries()) {
        if (item.frameCount > 1) hasAnimatedAutotile = true;
        frames.set(slot, autotileFrameIndex(now, this._animationStartedAt, item.frameCount, item.durationMs));
      }
      for (const layer of this._layers) {
        const tiles = prepared.buckets.get(layer.depth) ?? [];
        const bounds = { minX: layer.worldX, minY: layer.worldY };
        if (!justCommitted && this._autotileFrameDirty(layer, frames, tiles)) {
          this._drawDirtyAutotiles(layer, tiles, prepared, frames);
        }
        layer.frames = frames;
        layer.canvas.hidden = false;
        layer.canvas.style.zIndex = String(tileStackValue(layer.depth));
        layer.canvas.style.left = `${bounds.minX - cameraX}px`;
        layer.canvas.style.top = `${bounds.minY - cameraY}px`;
      }
      if (sprite) this._paintSprite(sprite, prepared, progress);
      const previous = this._lastPaintedCamera;
      if (!previous || previous.x !== cameraX || previous.y !== cameraY) {
        qualify("browser-first-motion-paint", {
          element: "map-view",
          motionId: motion?.id ?? null,
          visualX: cameraX,
          visualY: cameraY,
        });
        this._lastPaintedCamera = { x: cameraX, y: cameraY };
      }
      if (motion && progress >= 1) qualify("browser-motion-complete", { element: "map-view", motionId: motion.id, visualX: cameraX, visualY: cameraY });
      const needsNextFrame = Boolean((motion || sprite?.motion) && progress < 1) || hasAnimatedAutotile;
      if (needsNextFrame) {
        this._raf = requestAnimationFrame(() => {
          this._raf = undefined;
          this._tickAccepted(prepared, sequence, false);
        });
        const child = this._spriteChild();
        if (child) child._raf = this._raf;
        return;
      }
      this._raf = undefined;
      const child = this._spriteChild();
      if (child) child._raf = undefined;
    }

    _autotileFrameDirty(layer, frames, tiles) {
      if (!layer.frames) return true;
      for (const tile of tiles) {
        if (tile.visual[2] !== 1) continue;
        if (layer.frames.get(tile.visual[3]) !== frames.get(tile.visual[3])) return true;
      }
      return false;
    }

    _drawDirtyAutotiles(layer, tiles, prepared, frames) {
      for (const tile of tiles) {
        if (tile.visual[2] !== 1) continue;
        if (layer.frames && layer.frames.get(tile.visual[3]) === frames.get(tile.visual[3])) continue;
        const dx = tile.x * 32 - layer.worldX;
        const dy = tile.y * 32 - layer.worldY;
        this._tileClearCount += 1;
        layer.context.clearRect(dx, dy, 32, 32);
        this._blitTile(layer, tile, prepared, frames);
      }
    }

    _blitTile(layer, tile, prepared, frames) {
      this._tileDrawCount += 1;
      const dx = tile.x * 32 - layer.worldX;
      const dy = tile.y * 32 - layer.worldY;
      const visual = tile.visual;
      if (visual[2] === 0) {
        const source = visual[3];
        layer.context.drawImage(prepared.tilesetImage, (source % 8) * 32, Math.floor(source / 8) * 32, 32, 32, dx, dy, 32, 32);
        return;
      }
      const item = prepared.autotiles.get(visual[3]);
      const frameIndex = frames.get(visual[3]);
      if (item.layout === "cell") {
        layer.context.drawImage(item.image, frameIndex * 32, 0, 32, 32, dx, dy, 32, 32);
        return;
      }
      const frameX = frameIndex * 96;
      layer.context.drawImage(item.image, frameX + visual[4], visual[5], 16, 16, dx, dy, 16, 16);
      layer.context.drawImage(item.image, frameX + visual[6], visual[7], 16, 16, dx + 16, dy, 16, 16);
      layer.context.drawImage(item.image, frameX + visual[8], visual[9], 16, 16, dx, dy + 16, 16, 16);
      layer.context.drawImage(item.image, frameX + visual[10], visual[11], 16, 16, dx + 16, dy + 16, 16, 16);
    }

    _paintSprite(data, prepared, progress) {
      const sprite = this._desiredSprite?.sprite ?? this._spriteChild();
      if (!sprite || !prepared.spriteImage) return;
      const motion = data.motion;
      const pattern = motion ? (progress < 0.5 ? data.pattern : (data.pattern + 1) % 4) : 0;
      const screenX = motion ? Math.round(lerp(motion.fromScreenX, data.screenX, progress)) : data.screenX;
      const screenY = motion ? Math.round(lerp(motion.fromScreenY, data.screenY, progress)) : data.screenY;
      const visualPixelY = motion ? Math.round(lerp(motion.fromY * 32, data.y * 32, progress)) : data.y * 32;
      const size = sprite._blitPatternSync(prepared.spriteImage, data.direction, pattern, resourceIdentity(data.sprite));
      const frameWidth = size.width;
      const frameHeight = size.height;
      const depth = visualPixelY + 32 + (frameHeight > 32 ? 31 : 0);
      const left = screenX + (32 - frameWidth) / 2;
      const top = screenY + 32 - frameHeight;
      const rule = this._spriteRule();
      if (rule) {
        rule.style.left = `${left}px`;
        rule.style.top = `${top}px`;
        rule.style.width = `${frameWidth}px`;
        rule.style.height = `${frameHeight}px`;
        rule.style.zIndex = String(characterStackValue(depth));
      }
      sprite._lastPaintedScreen = { x: screenX, y: screenY };
      if (!sprite._reportedMotion || sprite._reportedMotion !== `${screenX},${screenY}`) {
        qualify("browser-first-motion-paint", {
          element: "map-sprite",
          motionId: motion?.id ?? null,
          visualX: screenX,
          visualY: screenY,
        });
        sprite._reportedMotion = `${screenX},${screenY}`;
      }
      if (motion && progress >= 1) qualify("browser-motion-complete", { element: "map-sprite", motionId: motion.id, visualX: screenX, visualY: screenY });
    }
  }

  class LoomRealmMapSprite extends ResourceHost {
    constructor() {
      super();
      const shadow = this.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = ":host{position:absolute;display:block;image-rendering:pixelated;pointer-events:none}canvas{display:block;image-rendering:pixelated}";
      this._canvas = document.createElement("canvas");
      shadow.append(style, this._canvas);
      this._context = this._canvas.getContext("2d", { alpha: true });
      this._context.imageSmoothingEnabled = false;
      this._latestData = undefined;
      this._activeMotion = null;
      this._raf = undefined;
      this._paintEpoch = 0;
      this._cropKey = undefined;
      this._acceptedIds = new Set();
    }

    disconnectedCallback() {
      queueMicrotask(() => {
        if (!this.isConnected) {
          this._paintEpoch += 1;
          this._activeMotion = null;
          this._raf = undefined;
          this._releaseAll();
          const parent = this._viewParent();
          if (parent) parent._sequence += 1;
        }
      });
    }

    _viewParent() {
      const parent = this.parentElement;
      return parent && parent.tagName === "LR-MAP-VIEW" ? parent : undefined;
    }

    _installCanvas(canvas, cropKey) {
      if (this._canvas === canvas) {
        this._cropKey = cropKey;
        return;
      }
      this._canvas.replaceWith(canvas);
      this._canvas = canvas;
      this._context = canvas.getContext("2d", { alpha: true });
      this._context.imageSmoothingEnabled = false;
      this._cropKey = cropKey;
    }

    receiveRenderData(data) {
      assertMapSpriteData(data);
      const fingerprint = data.motion === null ? null : JSON.stringify([
        data.motion.id, data.motion.durationMs, data.motion.fromY, data.motion.fromScreenX, data.motion.fromScreenY,
        data.x, data.y, data.screenX, data.screenY, data.direction, data.pattern,
      ]);
      if (this._activeMotion && data.motion && data.motion.id === this._activeMotion.id && fingerprint !== this._activeMotion.fingerprint) {
        throw new TypeError("Invalid map motion identity");
      }
      if (data.motion === null) this._activeMotion = null;
      else if (!this._activeMotion || this._activeMotion.id !== data.motion.id) {
        this._activeMotion = { id: data.motion.id, fingerprint, startedAt: performance.now() };
      }
      this._latestData = data;
      this._paintEpoch += 1;
      qualify("presentation-received", { element: "map-sprite", motionId: data.motionId });
      const parent = this._viewParent();
      if (parent) parent._receiveSprite(this, data, performance.now());
    }

    _blitPatternSync(image, direction, pattern, identity) {
      const frameWidth = image.width / 4;
      const frameHeight = image.height / 4;
      if (!Number.isInteger(frameWidth) || !Number.isInteger(frameHeight)) throw new TypeError("Character sheet must be 4 by 4");
      const key = `${identity}|${direction}|${pattern}|${frameWidth}x${frameHeight}`;
      if (this._cropKey !== key) {
        this._canvas.width = frameWidth;
        this._canvas.height = frameHeight;
        this._context.imageSmoothingEnabled = false;
        this._context.clearRect(0, 0, frameWidth, frameHeight);
        this._context.drawImage(image, pattern * frameWidth, ((direction - 2) / 2) * frameHeight, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);
        this._cropKey = key;
      }
      return { width: frameWidth, height: frameHeight };
    }
  }

  customElements.define("lr-map-view", LoomRealmMapView);
  customElements.define("lr-map-sprite", LoomRealmMapSprite);
})();
