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

  function resourceIdentity(ref) {
    return `${ref.namespace}\u0000${ref.key}\u0000${ref.contentVersion}`;
  }

  function validRef(value) {
    return value && typeof value === "object" && [value.namespace, value.key, value.contentVersion].every((part) => typeof part === "string" && part.length > 0);
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

  function exactObject(value, keys) {
    return Boolean(value) && typeof value === "object" && keys.every((key) => key in value) && Object.keys(value).length === keys.length;
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

  function validTileVisual(visual, autotiles) {
    if (!Array.isArray(visual) || visual.length !== 4 && visual.length !== 12) return false;
    if (!Number.isSafeInteger(visual[0]) || visual[0] <= 0) return false;
    if (!Number.isSafeInteger(visual[1])) return false;
    if (visual[2] === 0) {
      return visual.length === 4 && Number.isSafeInteger(visual[3]) && visual[3] >= 0;
    }
    if (visual[2] !== 1 || visual.length !== 12) return false;
    if (!Number.isSafeInteger(visual[3]) || visual[3] < 0 || visual[3] > 6) return false;
    if (!validRef(autotiles[visual[3]])) return false;
    return visual.slice(4).every((part) => Number.isSafeInteger(part) && part >= 0);
  }

  function validChunk(chunk) {
    return exactObject(chunk, ["chunkX", "chunkY", "cells"])
      && Number.isSafeInteger(chunk.chunkX) && chunk.chunkX >= 0
      && Number.isSafeInteger(chunk.chunkY) && chunk.chunkY >= 0
      && Array.isArray(chunk.cells) && chunk.cells.length === CHUNK_CELLS
      && chunk.cells.every((cell) => Number.isSafeInteger(cell) && cell >= 0);
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

  class ResourceHost extends HTMLElement {
    constructor() {
      super();
      this._resources = undefined;
      this._images = new Map();
    }

    receiveRenderContext(context) {
      if (!context || !context.resources || typeof context.resources.resource !== "function") throw new TypeError("Map presentation requires PresentationResourceClient");
      this._resources = context.resources;
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
          return createImageBitmap(new Blob([resource.bytes], { type: resource.mime }));
        })();
        this._images.set(identity, pending);
        pending.catch(() => this._images.delete(identity));
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

    disconnectedCallback() {
      queueMicrotask(() => {
        if (!this.isConnected) {
          this._sequence += 1;
          this._cancelRaf();
          this._cancelRetry();
          this._activeMotion = null;
          this._state = "DISPOSED";
        }
      });
    }

    receiveRenderData(data) {
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
        || !Array.isArray(data.tileVisuals) || !data.tileVisuals.every((visual) => validTileVisual(visual, data.autotiles))
        || !Array.isArray(data.chunks) || !data.chunks.every(validChunk)
        || !validCameraMotion(data.cameraMotion)
        || (data.cameraMotion === null) !== (data.motionId === null)
        || (data.cameraMotion !== null && data.cameraMotion.id !== data.motionId)
      ) throw new TypeError("Invalid MapViewRenderData");
      for (let index = 1; index < data.chunks.length; index += 1) {
        const previous = data.chunks[index - 1];
        const current = data.chunks[index];
        if (current.chunkY < previous.chunkY || (current.chunkY === previous.chunkY && current.chunkX <= previous.chunkX)) {
          throw new TypeError("Invalid MapViewRenderData");
        }
      }
      this._latestData = data;
      this._desiredView = { data, receivedAt: performance.now() };
      this._sequence += 1;
      this._paintEpoch = this._sequence;
      this._cancelRetry();
      this._retryAttempts = 0;
      qualify("presentation-received", { element: "map-view", motionId: data.motionId });
      void this._prepare(this._sequence);
    }

    _receiveSprite(sprite, data, receivedAt) {
      this._desiredSprite = { sprite, data, receivedAt };
      this._sequence += 1;
      this._paintEpoch = this._sequence;
      this._cancelRetry();
      this._retryAttempts = 0;
      void this._prepare(this._sequence);
    }

    async _prepare(sequence) {
      const view = this._desiredView;
      if (!view || sequence !== this._sequence || !this.isConnected) return;
      const spriteChild = this._spriteChild();
      const sprite = this._desiredSprite && this._desiredSprite.sprite === spriteChild ? this._desiredSprite : undefined;
      if (spriteChild && sprite && !tokensEqual(view.data, sprite.data)) return;
      if (sprite && ((view.data.cameraMotion === null) !== (sprite.data.motion === null) || view.data.motionId !== sprite.data.motionId)) {
        throw new TypeError("Invalid map motion identity");
      }
      this._state = this._accepted ? "PREPARING" : "PREPARING";
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
        };
        this._cameraOnlyCommits += 1;
        this._commit(prepared, sequence, false);
        return;
      }
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
          this._failPrepare(sequence, { hide: !this._accepted });
          return;
        }
      }
      let decoded = new Map();
      try {
        if (resources.uniqueRefs.size > 0) {
          decoded = new Map(await Promise.all([...resources.uniqueRefs.entries()].map(async ([identity, ref]) => [identity, await this._image(ref)])));
        }
        if (sprite) decoded.set(resourceIdentity(sprite.data.sprite), await sprite.sprite._image(sprite.data.sprite));
      } catch {
        this._failPrepare(sequence);
        return;
      }
      if (sequence !== this._sequence || !this.isConnected || this._desiredView !== view) return;
      const autotiles = new Map();
      for (const { slot, ref } of resources.usedSlots) {
        const image = decoded.get(resourceIdentity(ref));
        const layout = classifyAutotileLayout(image);
        const durationMs = autotileFrameDurationMs(ref);
        if (layout === "invalid" || durationMs === null) {
          this._failPrepare(sequence, { hide: !this._accepted });
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
      };
      this._commit(prepared, sequence, true);
    }

    _failPrepare(sequence, options = {}) {
      if (sequence !== this._sequence) return;
      this._cancelRaf();
      if (options.hide || !this._accepted) {
        this._ensureLayer(0);
        this._hideLayers();
      }
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

    _ensureLayer(index) {
      const existing = this._layers[index];
      if (existing) {
        existing.canvas.hidden = false;
        return existing;
      }
      const canvas = document.createElement("canvas");
      canvas.className = "tile-layer";
      const context = canvas.getContext("2d", { alpha: true });
      context.imageSmoothingEnabled = false;
      this.shadowRoot.insertBefore(canvas, this._slot);
      const layer = { canvas, context, worldX: 0, worldY: 0, depth: 0 };
      this._layers.push(layer);
      return layer;
    }

    _hideLayers() {
      for (const layer of this._layers) {
        layer.context.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
        layer.canvas.hidden = true;
      }
    }

    _trimLayers(count) {
      for (let index = count; index < this._layers.length; index += 1) {
        const layer = this._layers[index];
        layer.canvas.width = 1;
        layer.canvas.height = 1;
        layer.context.clearRect(0, 0, 1, 1);
        layer.canvas.hidden = true;
      }
    }

    _commit(prepared, sequence, rasterTiles = true) {
      if (sequence !== this._sequence || !this.isConnected) return;
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
      this._accepted = prepared;
      this._state = "VISIBLE";
      this._cancelRaf();
      this._paintStage(prepared, sequence, rasterTiles);
    }

    _paintStage(prepared, sequence, rasterTiles) {
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
      const groups = [...prepared.buckets.entries()].sort(([left], [right]) => left - right);
      let hasAnimatedAutotile = false;
      const frames = new Map();
      for (const [slot, item] of prepared.autotiles.entries()) {
        if (item.frameCount > 1) hasAnimatedAutotile = true;
        frames.set(slot, autotileFrameIndex(now, this._animationStartedAt, item.frameCount, item.durationMs));
      }

      for (let index = 0; index < groups.length; index += 1) {
        const [depth, tiles] = groups[index];
        const layer = this._ensureLayer(index);
        const bounds = depthBounds(tiles);
        const frameChanged = rasterTiles || this._autotileFrameDirty(layer, frames, tiles);
        if (rasterTiles || layer.canvas.width !== bounds.width || layer.canvas.height !== bounds.height) {
          this._tileResizeCount += 1;
          layer.canvas.width = Math.max(1, bounds.width);
          layer.canvas.height = Math.max(1, bounds.height);
          layer.context.imageSmoothingEnabled = false;
          layer.worldX = bounds.minX;
          layer.worldY = bounds.minY;
          this._drawTiles(layer, tiles, prepared, frames);
        } else if (frameChanged) {
          this._drawDirtyAutotiles(layer, tiles, prepared, frames);
        }
        layer.depth = depth;
        layer.frames = frames;
        layer.canvas.hidden = false;
        layer.canvas.style.zIndex = String(tileStackValue(depth));
        layer.canvas.style.left = `${bounds.minX - cameraX}px`;
        layer.canvas.style.top = `${bounds.minY - cameraY}px`;
      }
      this._trimLayers(groups.length);

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
          this._paintStage(prepared, sequence, false);
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

    _drawTiles(layer, tiles, prepared, frames) {
      this._tileClearCount += 1;
      layer.context.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
      for (const tile of tiles) this._blitTile(layer, tile, prepared, frames);
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
    }

    disconnectedCallback() {
      queueMicrotask(() => {
        if (!this.isConnected) {
          this._paintEpoch += 1;
          this._activeMotion = null;
          this._raf = undefined;
          const parent = this._viewParent();
          if (parent) parent._sequence += 1;
        }
      });
    }

    _viewParent() {
      const parent = this.parentElement;
      return parent && parent.tagName === "LR-MAP-VIEW" ? parent : undefined;
    }

    receiveRenderData(data) {
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
      void this._image(data.sprite).catch(() => undefined);
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
