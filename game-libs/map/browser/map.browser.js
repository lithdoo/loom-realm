(function registerLoomRealmMapElements() {
  "use strict";

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

  class ResourceElement extends HTMLElement {
    constructor() {
      super();
      this._resources = undefined;
      this._images = new Map();
      this._latestData = undefined;
      this._raf = undefined;
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
      this._cancelRaf();
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
        !data
        || !Number.isSafeInteger(data.cameraX) || data.cameraX < 0
        || !Number.isSafeInteger(data.cameraY) || data.cameraY < 0
        || !Array.isArray(data.tiles)
        || !validRef(data.tileset)
        || !validCameraMotion(data.cameraMotion)
      ) throw new TypeError("Invalid MapViewRenderData");
      for (const tile of data.tiles) {
        if (
          !tile || typeof tile !== "object"
          || !Number.isSafeInteger(tile.x) || tile.x < 0
          || !Number.isSafeInteger(tile.y) || tile.y < 0
          || ![0, 1, 2].includes(tile.z)
          || !Number.isSafeInteger(tile.tileId) || tile.tileId < 384
          || !Number.isSafeInteger(tile.depth) || tile.depth < 0
        ) {
          throw new TypeError("Invalid visible regular tile");
        }
      }
      this._cancelRaf();
      this._latestData = data;
      const receivedAt = performance.now();
      void this._paintLatest(data, receivedAt);
    }

    async _paintLatest(requested, receivedAt) {
      this._ensureLayer(0);
      let image;
      try {
        image = await this._image(requested.tileset);
      } catch {
        if (this._latestData !== requested) return;
        this._clearLayers();
        return;
      }
      if (this._latestData !== requested || !this.isConnected) return;

      const motion = requested.cameraMotion;
      const progress = motion ? clamp((performance.now() - receivedAt) / motion.durationMs, 0, 1) : 1;
      const cameraX = motion ? Math.round(lerp(motion.fromCameraX, requested.cameraX, progress)) : requested.cameraX;
      const cameraY = motion ? Math.round(lerp(motion.fromCameraY, requested.cameraY, progress)) : requested.cameraY;

      const buckets = new Map();
      for (const tile of requested.tiles) {
        let bucket = buckets.get(tile.depth);
        if (!bucket) {
          bucket = [];
          buckets.set(tile.depth, bucket);
        }
        bucket.push(tile);
      }

      const groups = [...buckets.entries()]
        .sort(([leftDepth], [rightDepth]) => leftDepth - rightDepth);

      for (let index = 0; index < groups.length; index += 1) {
        const [depth, tiles] = groups[index];
        const layer = this._ensureLayer(index);
        layer.context.clearRect(0, 0, 640, 480);
        layer.canvas.style.zIndex = String(tileStackValue(depth));

        for (const tile of tiles) {
          const source = tile.tileId - 384;
          const sx = (source % 8) * 32;
          const sy = Math.floor(source / 8) * 32;
          layer.context.drawImage(
            image,
            sx, sy, 32, 32,
            tile.x * 32 - cameraX,
            tile.y * 32 - cameraY,
            32, 32,
          );
        }
      }

      this._trimLayers(groups.length);
      if (motion && progress < 1) {
        this._raf = requestAnimationFrame(() => {
          this._raf = undefined;
          if (this._latestData !== requested || !this.isConnected) return;
          void this._paintLatest(requested, receivedAt);
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
      this._cancelRaf();
      this._latestData = data;
      const receivedAt = performance.now();
      void this._paintLatest(data, receivedAt);
    }

    async _paintLatest(requested, receivedAt) {
      let image;
      try { image = await this._image(requested.sprite); } catch {
        if (this._latestData !== requested) return;
        return;
      }
      if (this._latestData !== requested || !this.isConnected) return;
      const frameWidth = image.width / 4;
      const frameHeight = image.height / 4;
      if (!Number.isInteger(frameWidth) || !Number.isInteger(frameHeight)) throw new TypeError("Character sheet must be 4 by 4");
      const motion = requested.motion;
      const progress = motion ? clamp((performance.now() - receivedAt) / motion.durationMs, 0, 1) : 1;
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
      if (motion && progress < 1) {
        this._raf = requestAnimationFrame(() => {
          this._raf = undefined;
          if (this._latestData !== requested || !this.isConnected) return;
          void this._paintLatest(requested, receivedAt);
        });
        return;
      }
      this._raf = undefined;
    }
  }

  customElements.define("lr-map-view", LoomRealmMapView);
  customElements.define("lr-map-sprite", LoomRealmMapSprite);
})();
