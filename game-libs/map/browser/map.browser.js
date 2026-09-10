(function registerLoomRealmMapElements() {
  "use strict";

  function resourceIdentity(ref) {
    return `${ref.namespace}\u0000${ref.key}\u0000${ref.contentVersion}`;
  }

  function validRef(value) {
    return value && typeof value === "object" && [value.namespace, value.key, value.contentVersion].every((part) => typeof part === "string" && part.length > 0);
  }

  class ResourceElement extends HTMLElement {
    constructor() {
      super();
      this._resources = undefined;
      this._images = new Map();
      this._latestData = undefined;
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

  class LoomRealmMapView extends ResourceElement {
    constructor() {
      super();
      const shadow = this.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = ":host{display:block;position:relative;overflow:hidden;width:640px;height:480px}canvas{display:block;width:640px;height:480px;image-rendering:pixelated}.entities{position:absolute;inset:0;overflow:hidden;pointer-events:none}";
      this._canvas = document.createElement("canvas");
      this._canvas.width = 640;
      this._canvas.height = 480;
      const entities = document.createElement("div");
      entities.className = "entities";
      entities.append(document.createElement("slot"));
      shadow.append(style, this._canvas, entities);
      this._context = this._canvas.getContext("2d", { alpha: true });
      this._context.imageSmoothingEnabled = false;
    }

    receiveRenderData(data) {
      if (!data || !Number.isSafeInteger(data.cameraX) || !Number.isSafeInteger(data.cameraY) || !Array.isArray(data.tiles) || !validRef(data.tileset)) throw new TypeError("Invalid MapViewRenderData");
      this._latestData = data;
      this._paintLatest();
    }

    async _paintLatest() {
      const requested = this._latestData;
      this._context.clearRect(0, 0, 640, 480);
      if (!requested) return;
      let image;
      try { image = await this._image(requested.tileset); } catch { return; }
      const current = this._latestData;
      if (!current || resourceIdentity(current.tileset) !== resourceIdentity(requested.tileset)) return;
      this._context.clearRect(0, 0, 640, 480);
      for (const tile of current.tiles) {
        if (!tile || !Number.isSafeInteger(tile.x) || !Number.isSafeInteger(tile.y) || !Number.isSafeInteger(tile.tileId) || tile.tileId < 384) throw new TypeError("Invalid visible regular tile");
        const source = tile.tileId - 384;
        const sx = (source % 8) * 32;
        const sy = Math.floor(source / 8) * 32;
        this._context.drawImage(image, sx, sy, 32, 32, tile.x * 32 - current.cameraX, tile.y * 32 - current.cameraY, 32, 32);
      }
    }
  }

  class LoomRealmMapSprite extends ResourceElement {
    constructor() {
      super();
      const shadow = this.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = ":host{position:absolute;display:block;image-rendering:pixelated}canvas{display:block;image-rendering:pixelated}";
      this._canvas = document.createElement("canvas");
      shadow.append(style, this._canvas);
      this._context = this._canvas.getContext("2d", { alpha: true });
      this._context.imageSmoothingEnabled = false;
    }

    receiveRenderData(data) {
      if (!data || ![2, 4, 6, 8].includes(data.direction) || data.pattern !== 0 || !validRef(data.sprite)) throw new TypeError("Invalid MapSpriteRenderData");
      this._latestData = data;
      this._paintLatest();
    }

    async _paintLatest() {
      const requested = this._latestData;
      if (!requested) return;
      let image;
      try { image = await this._image(requested.sprite); } catch { return; }
      const current = this._latestData;
      if (!current || resourceIdentity(current.sprite) !== resourceIdentity(requested.sprite)) return;
      const frameWidth = image.width / 4;
      const frameHeight = image.height / 4;
      if (!Number.isInteger(frameWidth) || !Number.isInteger(frameHeight)) throw new TypeError("Character sheet must be 4 by 4");
      this._canvas.width = frameWidth;
      this._canvas.height = frameHeight;
      this._context.imageSmoothingEnabled = false;
      this._context.clearRect(0, 0, frameWidth, frameHeight);
      this._context.drawImage(image, 0, ((current.direction - 2) / 2) * frameHeight, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);
      this.style.left = `${current.screenX + (32 - frameWidth) / 2}px`;
      this.style.top = `${current.screenY + 32 - frameHeight}px`;
      this.style.width = `${frameWidth}px`;
      this.style.height = `${frameHeight}px`;
    }
  }

  if (!customElements.get("lr-map-view")) customElements.define("lr-map-view", LoomRealmMapView);
  if (!customElements.get("lr-map-sprite")) customElements.define("lr-map-sprite", LoomRealmMapSprite);
})();
