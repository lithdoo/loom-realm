(function registerLoomRealmMapElements() {
  "use strict";

  const AUTOTILE_TICK_MS = 50;
  const DEFAULT_AUTOTILE_FRAME_TICKS = 5;

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

  function validCorner(value) {
    return exactObject(value, ["sx", "sy"])
      && Number.isSafeInteger(value.sx) && value.sx >= 0
      && Number.isSafeInteger(value.sy) && value.sy >= 0;
  }

  function validBlit(value, autotiles) {
    if (!value || typeof value !== "object") return false;
    if (value.kind === "regular") {
      return exactObject(value, ["kind", "sourceIndex"])
        && Number.isSafeInteger(value.sourceIndex) && value.sourceIndex >= 0;
    }
    if (value.kind === "autotile") {
      return exactObject(value, ["kind", "slot", "corners"])
        && Number.isSafeInteger(value.slot) && value.slot >= 0 && value.slot <= 6
        && Array.isArray(value.corners) && value.corners.length === 4
        && value.corners.every(validCorner)
        && validRef(autotiles[value.slot]);
    }
    return false;
  }

  function autotileIdentities(autotiles) {
    return autotiles.map((item) => (item === null ? null : resourceIdentity(item)));
  }

  function sameIdentities(left, right) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }

  function validVisibleTile(tile, autotiles) {
    return exactObject(tile, ["x", "y", "z", "tileId", "depth", "blit"])
      && Number.isSafeInteger(tile.x) && tile.x >= 0
      && Number.isSafeInteger(tile.y) && tile.y >= 0
      && [0, 1, 2].includes(tile.z)
      && Number.isSafeInteger(tile.tileId) && tile.tileId > 0
      && Number.isSafeInteger(tile.depth) && tile.depth >= 0
      && validBlit(tile.blit, autotiles);
  }

  function prepareTileStatic(data) {
    const buckets = new Map();
    const usedSlots = [];
    const seenSlots = new Set();
    const uniqueRefs = new Map();
    let needsTileset = false;
    for (const tile of data.tiles) {
      let bucket = buckets.get(tile.depth);
      if (!bucket) {
        bucket = [];
        buckets.set(tile.depth, bucket);
      }
      bucket.push(tile);
      if (tile.blit.kind === "regular") {
        needsTileset = true;
        continue;
      }
      const slot = tile.blit.slot;
      const ref = data.autotiles[slot];
      if (!seenSlots.has(slot)) {
        seenSlots.add(slot);
        usedSlots.push({ slot, ref });
      }
      const identity = resourceIdentity(ref);
      if (!uniqueRefs.has(identity)) uniqueRefs.set(identity, ref);
    }
    if (needsTileset) uniqueRefs.set(resourceIdentity(data.tileset), data.tileset);
    return {
      tileset: resourceIdentity(data.tileset),
      autotiles: autotileIdentities(data.autotiles),
      buckets,
      usedSlots,
      uniqueRefs,
      needsTileset,
    };
  }

  function tilesCacheHit(element, data) {
    return data.tiles === element._preparedTilesSource
      && element._preparedTileStatic !== undefined
      && resourceIdentity(data.tileset) === element._preparedTileStatic.tileset
      && sameIdentities(autotileIdentities(data.autotiles), element._preparedTileStatic.autotiles);
  }

  function acceptMotion(current, motion, fingerprint) {
    if (current == null) {
      if (motion == null) return null;
      return { id: motion.id, fingerprint, startedAt: performance.now() };
    }
    if (motion == null) return null;
    if (motion.id === current.id) {
      if (fingerprint === current.fingerprint) return current;
      throw new TypeError("Invalid map motion identity");
    }
    return { id: motion.id, fingerprint, startedAt: performance.now() };
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

  class ResourceElement extends HTMLElement {
    constructor() {
      super();
      this._resources = undefined;
      this._images = new Map();
      this._latestData = undefined;
      this._raf = undefined;
      this._paintEpoch = 0;
      this._activeMotion = null;
    }

    receiveRenderContext(context) {
      if (!context || !context.resources || typeof context.resources.resource !== "function") throw new TypeError("Map presentation requires PresentationResourceClient");
      this._resources = context.resources;
    }

    _cancelRaf() {
      if (this._raf !== undefined) {
        cancelAnimationFrame(this._raf);
        this._raf = undefined;
      }
    }

    disconnectedCallback() {
      queueMicrotask(() => {
        if (!this.isConnected) {
          this._cancelRaf();
          this._paintEpoch += 1;
          this._activeMotion = null;
        }
      });
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

  class LoomRealmMapView extends ResourceElement {
    constructor() {
      super();
      const shadow = this.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = ":host{display:block;position:relative;overflow:hidden;width:640px;height:480px}canvas.tile-layer{position:absolute;inset:0;display:block;width:640px;height:480px;image-rendering:pixelated;pointer-events:none}canvas.tile-layer[hidden]{display:none}slot{display:contents}";
      this._layers = [];
      this._slot = document.createElement("slot");
      shadow.append(style, this._slot);
      this._animationStartedAt = performance.now();
      this._lastPaintToken = undefined;
      this._lastPaintedCamera = undefined;
      this._preparedTilesSource = undefined;
      this._preparedTileStatic = undefined;
    }

    _ensureLayer(index) {
      const existing = this._layers[index];
      if (existing) {
        existing.canvas.hidden = false;
        return existing;
      }
      const canvas = document.createElement("canvas");
      canvas.className = "tile-layer";
      canvas.width = 640;
      canvas.height = 480;
      const context = canvas.getContext("2d", { alpha: true });
      context.imageSmoothingEnabled = false;
      this.shadowRoot.insertBefore(canvas, this._slot);
      const layer = { canvas, context };
      this._layers.push(layer);
      return layer;
    }

    _clearLayers() {
      this._lastPaintToken = undefined;
      for (const layer of this._layers) {
        layer.context.clearRect(0, 0, 640, 480);
        layer.canvas.hidden = true;
      }
    }

    _trimLayers(count) {
      for (let index = count; index < this._layers.length; index += 1) {
        const layer = this._layers[index];
        layer.context.clearRect(0, 0, 640, 480);
        layer.canvas.hidden = true;
      }
    }

    receiveRenderData(data) {
      if (
        !exactObject(data, ["mapId", "mapWidth", "mapHeight", "cameraX", "cameraY", "tileset", "autotiles", "tiles", "cameraMotion"])
        || !Number.isSafeInteger(data.mapId) || data.mapId <= 0
        || !Number.isSafeInteger(data.mapWidth) || data.mapWidth <= 0
        || !Number.isSafeInteger(data.mapHeight) || data.mapHeight <= 0
        || !Number.isSafeInteger(data.cameraX) || data.cameraX < 0
        || !Number.isSafeInteger(data.cameraY) || data.cameraY < 0
        || !Array.isArray(data.tiles)
        || !validRef(data.tileset)
        || !Array.isArray(data.autotiles) || data.autotiles.length !== 7
        || !data.autotiles.every((item) => item === null || validRef(item))
        || !validCameraMotion(data.cameraMotion)
      ) throw new TypeError("Invalid MapViewRenderData");
      const cacheHit = tilesCacheHit(this, data);
      let preparedStatic = this._preparedTileStatic;
      if (!cacheHit) {
        for (const tile of data.tiles) {
          if (!validVisibleTile(tile, data.autotiles)) throw new TypeError("Invalid visible tile");
        }
        preparedStatic = prepareTileStatic(data);
      }
      const motion = data.cameraMotion;
      const fingerprint = motion === null ? null : JSON.stringify([
        motion.id,
        motion.durationMs,
        motion.fromCameraX,
        motion.fromCameraY,
        data.cameraX,
        data.cameraY,
      ]);
      const nextActive = acceptMotion(this._activeMotion, motion, fingerprint);
      this._latestData = data;
      this._activeMotion = nextActive;
      if (!cacheHit) {
        this._preparedTilesSource = data.tiles;
        this._preparedTileStatic = preparedStatic;
      }
      this._cancelRaf();
      this._paintEpoch += 1;
      qualify("presentation-received", { element: "map-view", motionId: motion?.id ?? null });
      void this._paintLatest(data, this._paintEpoch, preparedStatic);
    }

    async _paintLatest(requested, epoch, preparedStatic) {
      this._ensureLayer(0);
      const uniqueRefs = preparedStatic.uniqueRefs;
      let decoded = new Map();
      if (uniqueRefs.size > 0) {
        try {
          decoded = new Map(await Promise.all([...uniqueRefs.entries()].map(async ([identity, ref]) => [identity, await this._image(ref)])));
        } catch {
          if (this._latestData !== requested || epoch !== this._paintEpoch) return;
          this._clearLayers();
          return;
        }
      }
      if (this._latestData !== requested || epoch !== this._paintEpoch || !this.isConnected) return;

      const autotiles = new Map();
      for (const { slot, ref } of preparedStatic.usedSlots) {
        const image = decoded.get(resourceIdentity(ref));
        const layout = classifyAutotileLayout(image);
        const durationMs = autotileFrameDurationMs(ref);
        if (layout === "invalid" || durationMs === null) {
          this._clearLayers();
          return;
        }
        const frameWidth = layout === "block" ? 96 : 32;
        autotiles.set(slot, { image, layout, frameCount: image.width / frameWidth, frameWidth, durationMs });
      }
      this._paintPrepared(requested, epoch, {
        tilesetImage: preparedStatic.needsTileset ? decoded.get(resourceIdentity(requested.tileset)) : undefined,
        autotiles,
        buckets: preparedStatic.buckets,
      });
    }

    _paintPrepared(requested, epoch, prepared) {
      if (this._latestData !== requested || epoch !== this._paintEpoch || !this.isConnected) return;

      const now = performance.now();
      const motion = requested.cameraMotion;
      const active = this._activeMotion;
      const progress = active && motion ? clamp((now - active.startedAt) / motion.durationMs, 0, 1) : 1;
      const cameraX = motion ? Math.round(lerp(motion.fromCameraX, requested.cameraX, progress)) : requested.cameraX;
      const cameraY = motion ? Math.round(lerp(motion.fromCameraY, requested.cameraY, progress)) : requested.cameraY;
      const frames = [...prepared.autotiles.entries()]
        .sort(([left], [right]) => left - right)
        .map(([slot, item]) => `${slot}:${autotileFrameIndex(now, this._animationStartedAt, item.frameCount, item.durationMs)}`);
      const paintToken = `${epoch}|${cameraX},${cameraY}|${frames.join(",")}`;
      let hasAnimatedAutotile = false;
      for (const item of prepared.autotiles.values()) {
        if (item.frameCount > 1) hasAnimatedAutotile = true;
      }
      const needsNextFrame = Boolean(motion && progress < 1) || hasAnimatedAutotile;

      if (paintToken === this._lastPaintToken) {
        if (needsNextFrame) {
          this._raf = requestAnimationFrame(() => {
            this._raf = undefined;
            this._paintPrepared(requested, epoch, prepared);
          });
        } else {
          this._raf = undefined;
        }
        return;
      }
      this._lastPaintToken = paintToken;

      const groups = [...prepared.buckets.entries()]
        .sort(([leftDepth], [rightDepth]) => leftDepth - rightDepth);

      for (const layer of this._layers) {
        layer.context.clearRect(0, 0, 640, 480);
        layer.canvas.hidden = true;
      }

      for (let index = 0; index < groups.length; index += 1) {
        const [depth, tiles] = groups[index];
        const layer = this._ensureLayer(index);
        layer.canvas.hidden = false;
        layer.context.clearRect(0, 0, 640, 480);
        layer.canvas.style.zIndex = String(tileStackValue(depth));

        for (const tile of tiles) {
          const dx = tile.x * 32 - cameraX;
          const dy = tile.y * 32 - cameraY;
          if (tile.blit.kind === "regular") {
            const source = tile.blit.sourceIndex;
            const sx = (source % 8) * 32;
            const sy = Math.floor(source / 8) * 32;
            layer.context.drawImage(prepared.tilesetImage, sx, sy, 32, 32, dx, dy, 32, 32);
            continue;
          }
          const item = prepared.autotiles.get(tile.blit.slot);
          const frameIndex = autotileFrameIndex(now, this._animationStartedAt, item.frameCount, item.durationMs);
          if (item.layout === "cell") {
            layer.context.drawImage(item.image, frameIndex * 32, 0, 32, 32, dx, dy, 32, 32);
            continue;
          }
          const frameX = frameIndex * 96;
          const [tl, tr, bl, br] = tile.blit.corners;
          layer.context.drawImage(item.image, frameX + tl.sx, tl.sy, 16, 16, dx, dy, 16, 16);
          layer.context.drawImage(item.image, frameX + tr.sx, tr.sy, 16, 16, dx + 16, dy, 16, 16);
          layer.context.drawImage(item.image, frameX + bl.sx, bl.sy, 16, 16, dx, dy + 16, 16, 16);
          layer.context.drawImage(item.image, frameX + br.sx, br.sy, 16, 16, dx + 16, dy + 16, 16, 16);
        }
      }

      this._trimLayers(groups.length);
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
      if (needsNextFrame) {
        this._raf = requestAnimationFrame(() => {
          this._raf = undefined;
          this._paintPrepared(requested, epoch, prepared);
        });
        return;
      }
      this._raf = undefined;
    }
  }

  class LoomRealmMapSprite extends ResourceElement {
    constructor() {
      super();
      const shadow = this.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = ":host{position:absolute;display:block;image-rendering:pixelated;pointer-events:none}canvas{display:block;image-rendering:pixelated}";
      this._canvas = document.createElement("canvas");
      shadow.append(style, this._canvas);
      this._context = this._canvas.getContext("2d", { alpha: true });
      this._context.imageSmoothingEnabled = false;
      this._lastPaintedScreen = undefined;
    }

    receiveRenderData(data) {
      if (
        !data
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
      ) throw new TypeError("Invalid MapSpriteRenderData");
      const motion = data.motion;
      const fingerprint = motion === null ? null : JSON.stringify([
        motion.id,
        motion.durationMs,
        motion.fromY,
        motion.fromScreenX,
        motion.fromScreenY,
        data.x,
        data.y,
        data.screenX,
        data.screenY,
        data.direction,
        data.pattern,
      ]);
      const nextActive = acceptMotion(this._activeMotion, motion, fingerprint);
      this._latestData = data;
      this._activeMotion = nextActive;
      this._cancelRaf();
      this._paintEpoch += 1;
      qualify("presentation-received", { element: "map-sprite", motionId: motion?.id ?? null });
      void this._paintLatest(data, this._paintEpoch);
    }

    async _paintLatest(requested, epoch) {
      let image;
      try { image = await this._image(requested.sprite); } catch {
        if (this._latestData !== requested || epoch !== this._paintEpoch) return;
        return;
      }
      if (this._latestData !== requested || epoch !== this._paintEpoch || !this.isConnected) return;
      const frameWidth = image.width / 4;
      const frameHeight = image.height / 4;
      if (!Number.isInteger(frameWidth) || !Number.isInteger(frameHeight)) throw new TypeError("Character sheet must be 4 by 4");
      const motion = requested.motion;
      const active = this._activeMotion;
      const progress = active && motion ? clamp((performance.now() - active.startedAt) / motion.durationMs, 0, 1) : 1;
      const pattern = motion ? (progress < 0.5 ? requested.pattern : (requested.pattern + 1) % 4) : 0;
      const screenX = motion ? Math.round(lerp(motion.fromScreenX, requested.screenX, progress)) : requested.screenX;
      const screenY = motion ? Math.round(lerp(motion.fromScreenY, requested.screenY, progress)) : requested.screenY;
      const visualPixelY = motion ? Math.round(lerp(motion.fromY * 32, requested.y * 32, progress)) : requested.y * 32;
      const depth = visualPixelY + 32 + (frameHeight > 32 ? 31 : 0);
      this._canvas.width = frameWidth;
      this._canvas.height = frameHeight;
      this._context.imageSmoothingEnabled = false;
      this._context.clearRect(0, 0, frameWidth, frameHeight);
      this._context.drawImage(image, pattern * frameWidth, ((requested.direction - 2) / 2) * frameHeight, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);
      this.style.left = `${screenX + (32 - frameWidth) / 2}px`;
      this.style.top = `${screenY + 32 - frameHeight}px`;
      this.style.width = `${frameWidth}px`;
      this.style.height = `${frameHeight}px`;
      this.style.zIndex = String(characterStackValue(depth));
      const previous = this._lastPaintedScreen;
      if (!previous || previous.x !== screenX || previous.y !== screenY) {
        qualify("browser-first-motion-paint", {
          element: "map-sprite",
          motionId: motion?.id ?? null,
          visualX: screenX,
          visualY: screenY,
        });
        this._lastPaintedScreen = { x: screenX, y: screenY };
      }
      if (motion && progress >= 1) qualify("browser-motion-complete", { element: "map-sprite", motionId: motion.id, visualX: screenX, visualY: screenY });
      if (motion && progress < 1) {
        this._raf = requestAnimationFrame(() => {
          this._raf = undefined;
          if (this._latestData !== requested || epoch !== this._paintEpoch || !this.isConnected) return;
          void this._paintLatest(requested, epoch);
        });
        return;
      }
      this._raf = undefined;
    }
  }

  customElements.define("lr-map-view", LoomRealmMapView);
  customElements.define("lr-map-sprite", LoomRealmMapSprite);
})();
