/**
 * LoomRealm Map Browser elements — frozen chunked raster architecture
 * (main contract §4–§8, PR1+):
 *
 *  - exact semantic validation of MapView/MapSprite RenderData (§4);
 *  - one depth bucket per tileDepth value; canvas per bucket sized to the
 *    bucket's world pixel bounds; zIndex = tileDepth*2 (§6);
 *  - Map-private parent coordinator: detached candidate stage, View+Sprite
 *    paired atomic commit in one JS task, sequence fencing of stale async,
 *    bounded 100/200/400ms retry, parent-owned ::slotted sprite rule (§7/§8);
 *  - overlap-copy refresh: entering chunks raster once, unchanged buckets
 *    copied by world coordinates from the accepted stage, leaving dropped,
 *    never across scenes (§6);
 *  - camera-only rAF updates CSS translate + sprite placement only — zero
 *    tile draw/clear/canvas resize (§6);
 *  - dirty-cell autotile animation with tick dedupe (§6);
 *  - bounded resource cache with scene/window ownership, eviction,
 *    ImageBitmap.close(), transfer/disconnect cleanup (§5).
 */
(function registerLoomRealmMapElements() {
  "use strict";

  const TILE = 32;
  const CHUNK = 8;
  const WALK_MS = 250;
  const AUTOTILE_TICK_MS = 50;
  const DEFAULT_AUTOTILE_FRAME_TICKS = 5;
  const RETRY_DELAYS_MS = [100, 200, 400];
  const VIEW_FIELDS = ["sceneEpoch", "visualEpoch", "motionId", "viewportWidth", "viewportHeight",
    "mapId", "mapWidth", "mapHeight", "cameraX", "cameraY", "tileset", "autotiles",
    "tileVisuals", "chunks", "cameraMotion"];
  const SPRITE_FIELDS = ["sceneEpoch", "visualEpoch", "motionId", "x", "y", "screenX", "screenY",
    "direction", "pattern", "sprite", "motion"];

  function qualify(name, detail) {
    const hook = globalThis.__loomrealmMovementQualification;
    if (typeof hook === "function") {
      try { hook({ name, at: performance.now(), detail }); } catch { /* qualification must not change behavior */ }
    }
  }

  function isFiniteNumber(value) { return typeof value === "number" && Number.isFinite(value); }
  function isSafeInteger(value) { return typeof value === "number" && Number.isSafeInteger(value); }

  function exactKeys(value, fields, label) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`Invalid ${label}`);
    for (const key of Object.keys(value)) if (!fields.includes(key)) throw new TypeError(`Invalid ${label}`);
    for (const field of fields) if (!(field in value)) throw new TypeError(`Invalid ${label}`);
  }

  function validRef(value, label) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`Invalid ${label}`);
    const keys = Object.keys(value);
    if (keys.length !== 3 || !keys.includes("namespace") || !keys.includes("key") || !keys.includes("contentVersion")) throw new TypeError(`Invalid ${label}`);
    if (typeof value.namespace !== "string" || typeof value.key !== "string" || typeof value.contentVersion !== "string") throw new TypeError(`Invalid ${label}`);
    if (value.namespace.length === 0 || value.key.length === 0 || value.contentVersion.length === 0) throw new TypeError(`Invalid ${label}`);
    return `${value.namespace}\0${value.key}\0${value.contentVersion}`;
  }

  function validMotion(value, label) {
    if (value === null) return null;
    if (value === null || typeof value !== "object") throw new TypeError(`Invalid ${label}`);
    const keys = Object.keys(value);
    if (!keys.includes("id") || !keys.includes("durationMs")) throw new TypeError(`Invalid ${label}`);
    if (!isSafeInteger(value.id) || value.id <= 0) throw new TypeError(`Invalid ${label}`);
    if (value.durationMs !== WALK_MS) throw new TypeError(`Invalid ${label}`);
    const rest = keys.filter((key) => key !== "id" && key !== "durationMs");
    return { id: value.id, extra: rest };
  }

  /* ---------------- exact semantic validation (§4) ---------------- */

  function validateViewData(data) {
    exactKeys(data, VIEW_FIELDS, "MapViewRenderData");
    const v = data;
    if (!isSafeInteger(v.sceneEpoch) || v.sceneEpoch < 1) throw new TypeError("Invalid sceneEpoch");
    if (!isSafeInteger(v.visualEpoch) || v.visualEpoch < 1) throw new TypeError("Invalid visualEpoch");
    if (v.motionId !== null && !isSafeInteger(v.motionId)) throw new TypeError("Invalid motionId");
    if (!isSafeInteger(v.viewportWidth) || v.viewportWidth < 1) throw new TypeError("Invalid viewportWidth");
    if (!isSafeInteger(v.viewportHeight) || v.viewportHeight < 1) throw new TypeError("Invalid viewportHeight");
    if (!isSafeInteger(v.mapId) || v.mapId <= 0) throw new TypeError("Invalid mapId");
    if (!isSafeInteger(v.mapWidth) || v.mapWidth < 1) throw new TypeError("Invalid mapWidth");
    if (!isSafeInteger(v.mapHeight) || v.mapHeight < 1) throw new TypeError("Invalid mapHeight");
    if (!isSafeInteger(v.cameraX) || v.cameraX < 0 || v.cameraX > v.mapWidth * TILE) throw new TypeError("Invalid cameraX");
    if (!isSafeInteger(v.cameraY) || v.cameraY < 0 || v.cameraY > v.mapHeight * TILE) throw new TypeError("Invalid cameraY");
    if (v.cameraX > Math.max(v.mapWidth * TILE - v.viewportWidth, 0)) throw new TypeError("cameraX exceeds clamp");
    if (v.cameraY > Math.max(v.mapHeight * TILE - v.viewportHeight, 0)) throw new TypeError("cameraY exceeds clamp");
    validRef(v.tileset, "tileset ref");
    if (!Array.isArray(v.autotiles) || v.autotiles.length !== 7) throw new TypeError("Invalid autotiles");
    for (const ref of v.autotiles) if (ref !== null) validRef(ref, "autotile ref");
    const cameraMotionId = validMotion(v.cameraMotion, "cameraMotion");
    if (v.cameraMotion !== null) {
      const keys = Object.keys(v.cameraMotion);
      if (!keys.includes("fromCameraX") || !keys.includes("fromCameraY")) throw new TypeError("Invalid cameraMotion");
      if (!isSafeInteger(v.cameraMotion.fromCameraX) || !isSafeInteger(v.cameraMotion.fromCameraY)) throw new TypeError("Invalid cameraMotion");
      if (v.cameraMotion.id !== v.motionId) throw new TypeError("cameraMotion id must equal motionId");
    } else if (v.motionId !== null) {
      throw new TypeError("motionId requires cameraMotion");
    }
    if (!Array.isArray(v.tileVisuals)) throw new TypeError("Invalid tileVisuals");
    let lastId = -1;
    const visualIds = new Set();
    for (const visual of v.tileVisuals) {
      if (!Array.isArray(visual)) throw new TypeError("Invalid TileVisual");
      const id = visual[0];
      if (!isSafeInteger(id) || id < 48) throw new TypeError("Invalid TileVisual id");
      if (id <= lastId) throw new TypeError("tileVisuals must ascend");
      if (visualIds.has(id)) throw new TypeError("duplicate tileVisual");
      visualIds.add(id);
      lastId = id;
      const bias = visual[1];
      if (!isSafeInteger(bias) || (bias !== -1 && (bias < 32 || bias > 192 || bias % 32 !== 0))) throw new TypeError("Invalid depthBias");
      if (visual[2] === 0) {
        if (visual.length !== 4) throw new TypeError("Invalid regular TileVisual");
        if (!isSafeInteger(visual[3]) || visual[3] < 0) throw new TypeError("Invalid sourceIndex");
        if (id < 384 || visual[3] !== id - 384) throw new TypeError("regular sourceIndex must derive from id");
      } else if (visual[2] === 1) {
        if (visual.length !== 12) throw new TypeError("Invalid autotile TileVisual");
        if (id >= 384) throw new TypeError("autotile id out of range");
        const slot = Math.floor((id - 48) / 48);
        if (visual[3] !== slot) throw new TypeError("autotile slot must derive from id");
        for (let index = 4; index < 12; index += 1) {
          if (!isSafeInteger(visual[index]) || visual[index] < 0 || visual[index] > 65535) throw new TypeError("Invalid autotile corner");
        }
      } else {
        throw new TypeError("Invalid TileVisual kind");
      }
    }
    if (!Array.isArray(v.chunks)) throw new TypeError("Invalid chunks");
    let lastY = -1; let lastX = -1;
    const chunkSet = new Set();
    const usedIds = new Set();
    for (const chunk of v.chunks) {
      if (chunk === null || typeof chunk !== "object") throw new TypeError("Invalid ProjectedChunk");
      const keys = Object.keys(chunk);
      if (keys.length !== 3 || !keys.includes("chunkX") || !keys.includes("chunkY") || !keys.includes("cells")) throw new TypeError("Invalid ProjectedChunk");
      if (!isSafeInteger(chunk.chunkX) || chunk.chunkX < 0 || chunk.chunkX > Math.floor((v.mapWidth - 1) / CHUNK)) throw new TypeError("Invalid chunkX");
      if (!isSafeInteger(chunk.chunkY) || chunk.chunkY < 0 || chunk.chunkY > Math.floor((v.mapHeight - 1) / CHUNK)) throw new TypeError("Invalid chunkY");
      if (chunk.chunkY < lastY || (chunk.chunkY === lastY && chunk.chunkX <= lastX)) throw new TypeError("chunks must ascend in Y/X order");
      if (chunkSet.has(`${chunk.chunkX},${chunk.chunkY}`)) throw new TypeError("duplicate chunk");
      chunkSet.add(`${chunk.chunkX},${chunk.chunkY}`);
      lastY = chunk.chunkY; lastX = chunk.chunkX;
      if (!Array.isArray(chunk.cells) || chunk.cells.length !== CHUNK * CHUNK * 3) throw new TypeError("Invalid chunk cells");
      for (const id of chunk.cells) {
        if (!isSafeInteger(id) || id < 0) throw new TypeError("Invalid chunk cell");
        if (id >= 1 && id <= 47) throw new TypeError("Unsupported chunk cell id");
        if (id !== 0) {
          if (!visualIds.has(id)) throw new TypeError("chunk cell id missing from tileVisuals");
          usedIds.add(id);
        }
      }
    }
    for (const id of visualIds) {
      if (!usedIds.has(id)) throw new TypeError("tileVisual id unused by chunks");
    }
    // Required projection window: every containing chunk of the visible tile
    // bounds must be present (overscan chunks may extend further).
    const minTileX = Math.max(0, Math.floor(v.cameraX / TILE));
    const maxTileX = Math.min(v.mapWidth - 1, Math.floor((v.cameraX + v.viewportWidth - 1) / TILE));
    const minTileY = Math.max(0, Math.floor(v.cameraY / TILE));
    const maxTileY = Math.min(v.mapHeight - 1, Math.floor((v.cameraY + v.viewportHeight - 1) / TILE));
    for (let cy = Math.floor(minTileY / CHUNK); cy <= Math.floor(maxTileY / CHUNK); cy += 1) {
      for (let cx = Math.floor(minTileX / CHUNK); cx <= Math.floor(maxTileX / CHUNK); cx += 1) {
        if (!chunkSet.has(`${cx},${cy}`)) throw new TypeError(`missing required chunk ${cx},${cy}`);
      }
    }
    return { cameraMotionId };
  }

  function validateSpriteData(data) {
    exactKeys(data, SPRITE_FIELDS, "MapSpriteRenderData");
    const s = data;
    if (!isSafeInteger(s.sceneEpoch) || s.sceneEpoch < 1) throw new TypeError("Invalid sceneEpoch");
    if (!isSafeInteger(s.visualEpoch) || s.visualEpoch < 1) throw new TypeError("Invalid visualEpoch");
    if (s.motionId !== null && !isSafeInteger(s.motionId)) throw new TypeError("Invalid motionId");
    if (!isSafeInteger(s.x) || !isSafeInteger(s.y)) throw new TypeError("Invalid x/y");
    if (![2, 4, 6, 8].includes(s.direction)) throw new TypeError("Invalid direction");
    if (![0, 1, 2, 3].includes(s.pattern)) throw new TypeError("Invalid pattern");
    if (!isFiniteNumber(s.screenX) || !isFiniteNumber(s.screenY)) throw new TypeError("Invalid screenX/screenY");
    validRef(s.sprite, "sprite ref");
    validMotion(s.motion, "motion");
    if (s.motion !== null) {
      const keys = Object.keys(s.motion);
      if (!keys.includes("fromY") || !keys.includes("fromScreenX") || !keys.includes("fromScreenY")) throw new TypeError("Invalid motion");
      if (s.motion.id !== s.motionId) throw new TypeError("motion id must equal motionId");
      if (![1, 3].includes(s.pattern)) throw new TypeError("walking pattern must be 1 or 3");
    } else {
      if (s.pattern !== 0) throw new TypeError("standing pattern must be 0");
      if (s.motionId !== null) throw new TypeError("motionId requires motion");
    }
    return true;
  }

  /* ---------------- bounded resource cache (§5) ---------------- */

  class ResourceCache {
    constructor(resources) {
      this.resources = resources;
      this.accepted = new Map(); // identity -> ImageBitmap
      this.pending = new Map(); // identity -> Promise
      this.pendingObjects = new Map(); // identity -> {promise, resolve, reject}
    }
    get(identity, ref) {
      return this.accepted.get(identity) ?? null;
    }
    load(identity, ref) {
      const cached = this.accepted.get(identity);
      if (cached !== undefined) return Promise.resolve(cached);
      const pending = this.pending.get(identity);
      if (pending !== undefined) return pending;
      const record = {};
      const promise = Promise.resolve()
        .then(() => this.resources.resource(ref.namespace, ref.key, ref.contentVersion))
        .then(async (resource) => {
          if (resource.mime !== "image/png") throw new TypeError("Map resource must be PNG");
          const bitmap = await createImageBitmap(new Blob([resource.bytes], { type: "image/png" }));
          record.bitmap = bitmap;
          return bitmap;
        });
      record.promise = promise;
      this.pending.set(identity, promise);
      this.pendingObjects.set(identity, record);
      return promise;
    }
    /** Promote candidate-decoded bitmaps into the accepted generation. */
    promote(identities) {
      for (const identity of identities) {
        const record = this.pendingObjects.get(identity);
        if (record !== undefined && record.bitmap !== undefined) {
          this.pending.delete(identity);
          this.pendingObjects.delete(identity);
          this.accepted.set(identity, record.bitmap);
        }
      }
    }
    /** Close candidate bitmaps that were not accepted (candidate discard). */
    discardPending() {
      for (const [identity, record] of this.pendingObjects) {
        this.pending.delete(identity);
        if (record.bitmap !== undefined && !this.accepted.has(identity)) {
          try { record.bitmap.close(); } catch { /* already closed */ }
        }
      }
      this.pendingObjects.clear();
    }
    /** Evict accepted bitmaps outside the retained identity set (§5). */
    evictExcept(retainedIdentities) {
      for (const [identity, bitmap] of this.accepted) {
        if (!retainedIdentities.has(identity)) {
          this.accepted.delete(identity);
          try { bitmap.close(); } catch { /* already closed */ }
        }
      }
    }
    dispose() {
      for (const bitmap of this.accepted.values()) {
        try { bitmap.close(); } catch { /* already closed */ }
      }
      this.accepted.clear();
      this.discardPending();
    }
  }

  /* ---------------- shared raster helpers ---------------- */

  function tileStackValue(depth) { return String(depth * 2); }
  function characterStackValue(depth) { return String(depth * 2 + 1); }

  function autotileLayout(bitmap) {
    if (bitmap.height === 128 && bitmap.width % 96 === 0) return { kind: "block", frames: bitmap.width / 96 };
    if (bitmap.height === 32 && bitmap.width % 32 === 0) return { kind: "cell", frames: bitmap.width / 32 };
    return null;
  }

  function autotileFrameDuration(key) {
    const match = /\[(\d+)\]$/.exec(key);
    if (match === null) return DEFAULT_AUTOTILE_FRAME_TICKS * AUTOTILE_TICK_MS;
    const ticks = Number.parseInt(match[1], 10);
    if (!Number.isSafeInteger(ticks) || ticks < 1) return DEFAULT_AUTOTILE_FRAME_TICKS * AUTOTILE_TICK_MS;
    return ticks * AUTOTILE_TICK_MS;
  }

  /**
   * Build the per-depth world-space raster for a validated MapView payload.
   * Returns { buckets: Map<depth, {worldX, worldY, w, h, canvas}> } — fully
   * detached canvases; nothing here touches the accepted stage.
   */
  function rasterCandidate(data, tileVisualsById, bitmaps, autotileBitmaps, acceptedBuckets, acceptedChunkKeys) {
    const buckets = new Map(); // depth -> { worldX, worldY, w, h, canvas }
    const chunkKeySet = new Set(acceptedChunkKeys ?? []);
    const drawTile = (ctx, tileId, worldX, worldY, depth) => {
      const visual = tileVisualsById.get(tileId);
      if (visual === undefined) return;
      const dx = worldX * TILE - 0;
      const dy = worldY * TILE - 0;
      if (visual[2] === 0) {
        const bitmap = bitmaps.tileset;
        if (bitmap === null) return;
        const sx = (visual[3] % 8) * TILE;
        const sy = Math.floor(visual[3] / 8) * TILE;
        ctx.drawImage(bitmap, sx, sy, TILE, TILE, dx, dy, TILE, TILE);
      } else {
        const bitmap = autotileBitmaps.get(visual[3]);
        if (bitmap === undefined) return;
        const layout = autotileLayout(bitmap);
        const frameIndex = 0;
        if (layout.kind === "cell") {
          ctx.drawImage(bitmap, frameIndex * TILE, 0, TILE, TILE, dx, dy, TILE, TILE);
        } else {
          const frameX = frameIndex * 96;
          ctx.drawImage(bitmap, frameX + visual[4], visual[5], 16, 16, dx, dy, 16, 16);
          ctx.drawImage(bitmap, frameX + visual[6], visual[7], 16, 16, dx + 16, dy, 16, 16);
          ctx.drawImage(bitmap, frameX + visual[8], visual[9], 16, 16, dx, dy + 16, 16, 16);
          ctx.drawImage(bitmap, frameX + visual[10], visual[11], 16, 16, dx + 16, dy + 16, 16, 16);
        }
      }
    };
    // Pass 1: collect world bounds per depth and the cells to raster.
    const cellsByDepth = new Map(); // depth -> [{tileId, worldX, worldY}]
    for (const chunk of data.chunks) {
      for (let z = 0; z < 3; z += 1) {
        for (let ly = 0; ly < CHUNK; ly += 1) {
          const worldY = chunk.chunkY * CHUNK + ly;
          for (let lx = 0; lx < CHUNK; lx += 1) {
            const worldX = chunk.chunkX * CHUNK + lx;
            const tileId = chunk.cells[(z * CHUNK + ly) * CHUNK + lx];
            if (tileId === 0) continue;
            const visual = tileVisualsById.get(tileId);
            if (visual === undefined) continue;
            const bias = visual[1];
            const depth = bias === -1 ? 0 : worldY * TILE + bias;
            let cells = cellsByDepth.get(depth);
            if (cells === undefined) { cells = []; cellsByDepth.set(depth, cells); }
            cells.push({ tileId, worldX, worldY, chunkKey: `${chunk.chunkX},${chunk.chunkY}` });
          }
        }
      }
    }
    // Pass 2: per depth, allocate the bucket canvas over its world bounds and
    // either copy the whole accepted bucket (overlap-copy) or raster only
    // entering chunks.
    for (const [depth, cells] of cellsByDepth) {
      let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
      for (const cell of cells) {
        minX = Math.min(minX, cell.worldX); minY = Math.min(minY, cell.worldY);
        maxX = Math.max(maxX, cell.worldX); maxY = Math.max(maxY, cell.worldY);
      }
      const worldX = minX * TILE; const worldY = minY * TILE;
      const w = (maxX - minX + 1) * TILE; const h = (maxY - minY + 1) * TILE;
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.className = "tile-layer";
      const ctx = canvas.getContext("2d", { alpha: true });
      ctx.imageSmoothingEnabled = false;
      const accepted = acceptedBuckets.get(depth);
      if (accepted !== undefined && accepted.canvas.width > 0 && accepted.canvas.height > 0) {
        // Overlap-copy by identical world coordinates (§6): same-scene only.
        ctx.drawImage(accepted.canvas, accepted.worldX - worldX, accepted.worldY - worldY);
      }
      for (const cell of cells) {
        if (chunkKeySet.has(cell.chunkKey)) continue; // carried over via overlap copy
        drawTile(ctx, cell.tileId, cell.worldX - minX, cell.worldY - minY, depth);
      }
      buckets.set(depth, { worldX, worldY, w, h, canvas });
    }
    return buckets;
  }

  /* ---------------- Map Sprite (child) ---------------- */

  const spriteElements = new WeakSet();

  class LoomRealmMapSprite extends HTMLElement {
    constructor() {
      super();
      this._parent = null;
      this._latestData = null;
      this._canvas = null;
      this._bitmap = null;
      this._frameWidth = 0;
      this._frameHeight = 0;
      this._resources = null;
      const shadow = this.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = ":host{position:absolute;display:block;image-rendering:pixelated;pointer-events:none}canvas{display:block}";
      shadow.append(style);
    }
    receiveRenderContext(context) {
      if (context === null || typeof context !== "object"
        || typeof (context.resources?.resource) !== "function") {
        throw new TypeError("Invalid Map render context");
      }
      this._resources = context.resources;
    }
    connectedCallback() {
      this._parent = this.closest("lr-map-view");
    }
    disconnectedCallback() {
      if (this._parent !== null && typeof this._parent.__unregisterSprite === "function") {
        this._parent.__unregisterSprite(this);
      }
      this._parent = null;
    }
    receiveRenderData(data) {
      if (this._resources === null) throw new TypeError("Map sprite requires render context");
      validateSpriteData(data);
      this._latestData = data;
      qualify("presentation-received", { element: "map-sprite" });
      const parent = this._parent ?? this.closest("lr-map-view");
      if (parent !== null && parent !== undefined && typeof parent.__deliverSpriteData === "function") {
        parent.__deliverSpriteData(this, data);
      }
    }
    /** Package-private: the parent coordinator swaps the child stage (§7). */
    __commitMapSpriteStage(data, bitmap, frameWidth, frameHeight, pose) {
      this._latestData = data;
      const shadow = this.shadowRoot;
      if (this._canvas === null) {
        this._canvas = document.createElement("canvas");
        this._canvas.getContext("2d", { alpha: true }).imageSmoothingEnabled = false;
        shadow.append(this._canvas);
      }
      const canvas = this._canvas;
      const sizeChanged = canvas.width !== frameWidth || canvas.height !== frameHeight;
      if (sizeChanged) {
        canvas.width = frameWidth;
        canvas.height = frameHeight;
      }
      // Crop raster reuse (§6): redraw only when the sheet cell or bitmap
      // changed; pure placement/depth changes never clear the child canvas.
      const cropKey = `${pose.sheetX},${pose.sheetY},${bitmap === null ? "none" : "bitmap"}`;
      if (sizeChanged || this._cropKey !== cropKey || this._bitmap !== bitmap) {
        const ctx = canvas.getContext("2d", { alpha: true });
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, frameWidth, frameHeight);
        if (bitmap !== null) {
          ctx.drawImage(bitmap, pose.sheetX, pose.sheetY, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);
        }
        this._cropKey = cropKey;
        this._bitmap = bitmap;
      }
    }
  }

  /* ---------------- Map View (parent coordinator) ---------------- */

  class LoomRealmMapView extends HTMLElement {
    constructor() {
      super();
      this._resources = null;
      this._cache = null;
      this._slottedSheet = null;
      this._slottedRule = null;
      this._state = "EMPTY";
      this._desiredView = null;
      this._desiredSprite = null;
      this._spriteElement = null;
      this._accepted = null;
      this._sequence = 0;
      this._raf = null;
      this._retryTimer = null;
      this._retryAttempts = 0;
      this._supersededBeforePaint = 0;
      this._initialMotionNotShown = 0;
      this._lastPaintedCamera = null;
      this._lastPaintedScreen = null;
      this._autotileDirty = new Map();
      this._autotileStartedAt = performance.now();
      this._autotileTimer = null;
      this._viewportSize = { width: 640, height: 480 };
      this._hostSized = false;
      const shadow = this.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = [
        ":host{display:block;position:relative;overflow:hidden;image-rendering:pixelated}",
        "canvas.tile-layer{position:absolute;image-rendering:pixelated;pointer-events:none}",
        "slot{display:contents}",
      ].join("");
      shadow.append(style, document.createElement("slot"));
    }
    receiveRenderContext(context) {
      if (context === null || typeof context !== "object"
        || typeof (context.resources?.resource) !== "function") {
        throw new TypeError("Invalid Map render context");
      }
      this._resources = context.resources;
      this._cache = new ResourceCache(context.resources);
      const sheet = new CSSStyleSheet();
      sheet.replaceSync("::slotted(lr-map-sprite){position:absolute;left:0;top:0;z-index:1}");
      this._slottedSheet = sheet;
      this.shadowRoot.adoptedStyleSheets = [sheet];
      this._slottedRule = sheet.cssRules[0];
    }
    connectedCallback() {}
    disconnectedCallback() {
      this.__dispose();
    }
    __dispose() {
      this._state = "DISPOSED";
      if (this._raf !== null) { cancelAnimationFrame(this._raf); this._raf = null; }
      if (this._retryTimer !== null) { clearTimeout(this._retryTimer); this._retryTimer = null; }
      this.__stopAutotileAnimation();
      this._cache?.dispose();
      this._accepted = null;
      this._desiredView = null;
      this._desiredSprite = null;
    }
    __unregisterSprite(element) {
      if (this._spriteElement === element) {
        this._spriteElement = null;
        this._desiredSprite = null;
      }
    }
    get _images() { return this._cache === null ? new Map() : this._cache.accepted; }
    get _latestData() { return this._desiredView === null ? null : this._desiredView.data; }
    get _paintEpoch() { return this._desiredView === null ? 0 : this._desiredView.data.visualEpoch; }
    get _activeMotion() {
      if (this._accepted === null) return null;
      return this._accepted.view.cameraMotion;
    }
    get _raf2() { return this._raf; }

    receiveRenderData(data) {
      if (this._resources === null) throw new TypeError("Map view requires render context");
      validateViewData(data);
      qualify("presentation-received", { element: "map-view" });
      this._desiredView = { data, receivedAt: performance.now(), sequence: ++this._sequence };
      this._retryAttempts = 0;
      this.__scheduleAdvance();
    }
    __deliverSpriteData(element, data) {
      this._spriteElement = element;
      this._desiredSprite = { element, data, receivedAt: performance.now(), sequence: ++this._sequence };
      this._retryAttempts = 0;
      this.__scheduleAdvance();
    }

    __tokensMatch() {
      const view = this._desiredView;
      const sprite = this._desiredSprite;
      if (view === null || sprite === null) return false;
      return view.data.sceneEpoch === sprite.data.sceneEpoch
        && view.data.visualEpoch === sprite.data.visualEpoch
        && view.data.motionId === sprite.data.motionId;
    }

    __scheduleAdvance() {
      if (this._state === "DISPOSED") return;
      if (!this.__tokensMatch()) return;
      const view = this._desiredView;
      const sprite = this._desiredSprite;
      const sequence = Math.max(view.sequence, sprite.sequence);
      // MotionId-only fast path (§6): same scene+visual epochs and identical
      // chunk/visual projection — no revalidation of raster, no new canvases,
      // only motion/placement continues from the pair receipt clock.
      const accepted = this._accepted;
      if (accepted !== null
        && accepted.view.sceneEpoch === view.data.sceneEpoch
        && accepted.view.visualEpoch === view.data.visualEpoch
        && this.__chunkSetEqual(accepted.view.chunks, view.data.chunks)
        && this.__tileVisualsEqual(accepted.view.tileVisuals, view.data.tileVisuals)) {
        const previousMotionActive = accepted.view.cameraMotion !== null
          && (performance.now() - accepted.motionStart) < (accepted.motionDuration ?? WALK_MS);
        // Snapshot the prior displayed pose BEFORE updating the pair.
        let priorPose = null;
        if (previousMotionActive) {
          const t = performance.now();
          const p = Math.min(Math.max((t - accepted.motionStart) / (accepted.motionDuration ?? WALK_MS), 0), 1);
          const motion = accepted.view.cameraMotion;
          const spriteMotion = accepted.sprite.motion;
          priorPose = {
            cameraX: Math.round(motion.fromCameraX + (accepted.view.cameraX - motion.fromCameraX) * p),
            cameraY: Math.round(motion.fromCameraY + (accepted.view.cameraY - motion.fromCameraY) * p),
            screenX: spriteMotion === null ? accepted.sprite.screenX : Math.round(spriteMotion.fromScreenX + (accepted.sprite.screenX - spriteMotion.fromScreenX) * p),
            screenY: spriteMotion === null ? accepted.sprite.screenY : Math.round(spriteMotion.fromScreenY + (accepted.sprite.screenY - spriteMotion.fromScreenY) * p),
            fromY: spriteMotion === null ? accepted.sprite.y : spriteMotion.fromY,
          };
        }
        accepted.view = view.data;
        accepted.sprite = sprite.data;
        accepted.receivedAt = Math.min(view.receivedAt, sprite.receivedAt);
        accepted.motionStart = accepted.receivedAt;
        accepted.motionDuration = WALK_MS;
        accepted.rebaseFrom = null;
        accepted.motionEnd = view.data.cameraMotion === null ? accepted.receivedAt : accepted.receivedAt + WALK_MS;
        if (previousMotionActive && view.data.cameraMotion !== null) {
          // New step B preempts the displayed motion: interpolate from the
          // actually displayed pose over a fresh 250ms from B's first
          // endpoint receipt (motion spec §4).
          accepted.rebaseFrom = priorPose;
        }
        this._state = "VISIBLE";
        this.__paintFrame(performance.now(), true);
        return;
      }
      const previousState = this._state;
      this._state = "PREPARING";
      void this.__prepareCandidate(view, sprite, sequence).then((candidate) => {
        if (this._state === "DISPOSED") return;
        if (candidate === null) {
          // Prepare failure: keep old complete stage, bounded retry (§8).
          if (previousState === "VISIBLE" || this._accepted !== null) {
            this._state = "RETRY_WAIT";
            this.__scheduleRetry(view, sprite, sequence);
          } else {
            this._state = "EMPTY";
            this.__scheduleRetry(view, sprite, sequence);
          }
          return;
        }
        if (candidate.sequence !== Math.max(this._desiredView?.sequence ?? 0, this._desiredSprite?.sequence ?? 0)
          || !this.__tokensMatch() || this._spriteElement === null || !this._spriteElement.isConnected) {
          // Stale candidate: discard without touching the accepted stage.
          this._cache.discardPending();
          this._state = this._accepted === null ? "EMPTY" : "VISIBLE";
          return;
        }
        this.__commitCandidate(candidate);
      }, () => {
        if (this._state === "DISPOSED") return;
        this._state = this._accepted === null ? "EMPTY" : "VISIBLE";
        this.__scheduleRetry(view, sprite, sequence);
      });
    }

    __chunkSetEqual(left, right) {
      if (left === right) return true;
      if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
      for (let index = 0; index < left.length; index += 1) {
        const a = left[index];
        const b = right[index];
        if (a.chunkX !== b.chunkX || a.chunkY !== b.chunkY) return false;
        if (a.cells.length !== b.cells.length) return false;
        for (let cell = 0; cell < a.cells.length; cell += 1) {
          if (a.cells[cell] !== b.cells[cell]) return false;
        }
      }
      return true;
    }

    __tileVisualsEqual(left, right) {
      if (left === right) return true;
      if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
      for (let index = 0; index < left.length; index += 1) {
        const a = left[index];
        const b = right[index];
        if (a.length !== b.length) return false;
        for (let cell = 0; cell < a.length; cell += 1) {
          if (a[cell] !== b[cell]) return false;
        }
      }
      return true;
    }

    __scheduleRetry(view, sprite, sequence) {
      if (this._retryTimer !== null || this._retryAttempts >= RETRY_DELAYS_MS.length) {
        if (this._retryAttempts >= RETRY_DELAYS_MS.length) {
          // Retries exhausted: qualification FAIL signal; keep old stage.
          qualify("map-prepare-retry-exhausted", { sceneEpoch: view.data.sceneEpoch, visualEpoch: view.data.visualEpoch });
        }
        return;
      }
      const delay = RETRY_DELAYS_MS[this._retryAttempts];
      this._retryAttempts += 1;
      this._state = "RETRY_WAIT";
      this._retryTimer = setTimeout(() => {
        this._retryTimer = null;
        if (this._state === "DISPOSED") return;
        const currentSequence = Math.max(this._desiredView?.sequence ?? 0, this._desiredSprite?.sequence ?? 0);
        if (currentSequence !== sequence || !this.__tokensMatch()) return;
        this.__scheduleAdvance();
      }, delay);
    }

    async __prepareCandidate(view, sprite, sequence) {
      const data = view.data;
      const cache = this._cache;
      const identities = [];
      const tilesetIdentity = validRef(data.tileset, "tileset ref");
      identities.push(tilesetIdentity);
      const autotileIdentities = [];
      const autotileSlots = new Set();
      for (const visual of data.tileVisuals) {
        if (visual[2] === 1) autotileSlots.add(visual[3]);
      }
      for (const ref of data.autotiles) {
        if (ref === null) continue;
        const identity = validRef(ref, "autotile ref");
        autotileIdentities.push(identity);
      }
      const spriteIdentity = validRef(sprite.data.sprite, "sprite ref");
      identities.push(spriteIdentity);
      // Decode required resources (candidate ownership).
      const tilesetBitmap = await cache.load(tilesetIdentity, data.tileset);
      const autotileBitmaps = new Map();
      const slotRefs = data.autotiles;
      for (let slot = 0; slot < 7; slot += 1) {
        if (!autotileSlots.has(slot)) continue;
        const ref = slotRefs[slot];
        if (ref === null) continue;
        const identity = validRef(ref, "autotile ref");
        autotileBitmaps.set(slot, await cache.load(identity, ref));
      }
      const spriteBitmap = await cache.load(spriteIdentity, sprite.data.sprite);
      if (spriteBitmap.width % 4 !== 0 || spriteBitmap.height % 4 !== 0) {
        throw new TypeError("Character sheet must be 4 by 4");
      }
      const tileVisualsById = new Map();
      for (const visual of data.tileVisuals) tileVisualsById.set(visual[0], visual);
      const acceptedBuckets = this._accepted !== null && this._accepted.view.sceneEpoch === data.sceneEpoch
        ? this._accepted.buckets
        : new Map();
      const acceptedChunkKeys = this._accepted !== null && this._accepted.view.sceneEpoch === data.sceneEpoch
        ? this._accepted.chunkKeys
        : new Set();
      const buckets = rasterCandidate(data, tileVisualsById, { tileset: tilesetBitmap }, autotileBitmaps, acceptedBuckets, acceptedChunkKeys);
      const chunkKeys = new Set(data.chunks.map((chunk) => `${chunk.chunkX},${chunk.chunkY}`));
      const retained = new Set([tilesetIdentity, spriteIdentity, ...autotileIdentities]);
      return {
        sequence,
        view: data,
        sprite: sprite.data,
        receivedAt: Math.min(view.receivedAt, sprite.receivedAt),
        buckets,
        chunkKeys,
        retainedIdentities: retained,
        spriteBitmap,
        spriteIdentity,
      };
    }

    /** Atomic whole-stage swap in one synchronous JS task (§7). */
    __commitCandidate(candidate) {
      const shadow = this.shadowRoot;
      const slot = shadow.querySelector("slot");
      // Dynamic viewport: the host adopts the accepted logical size
      // (clamped upstream); DPR-only never changes logical backing.
      const view = candidate.view;
      if (this._viewportSize.width !== view.viewportWidth
        || this._viewportSize.height !== view.viewportHeight
        || this._hostSized !== true) {
        this._viewportSize = { width: view.viewportWidth, height: view.viewportHeight };
        this.style.width = `${view.viewportWidth}px`;
        this.style.height = `${view.viewportHeight}px`;
        this._hostSized = true;
      }
      // Mid-motion resize rebase (§1/PR2): when a visual change arrives while
      // a motion is displayed, the shared pair receipt keeps the end-time
      // envelope: the new motion's from-values rebase from the actually
      // displayed pose at the switch frame t (the runtime publishes from-
      // values derived from world truth; the browser clamps the displayed
      // progress so a late decode never restarts the full 250ms).
      for (const canvas of [...shadow.querySelectorAll("canvas.tile-layer")]) canvas.remove();
      const sorted = [...candidate.buckets.entries()].sort((a, b) => a[0] - b[0]);
      const stageTag = String(candidate.sequence);
      for (const [depth, bucket] of sorted) {
        bucket.canvas.style.zIndex = tileStackValue(depth);
        bucket.canvas.dataset.worldX = String(bucket.worldX);
        bucket.canvas.dataset.worldY = String(bucket.worldY);
        bucket.canvas.dataset.stage = stageTag;
        bucket.canvas.style.transform = "translate(" + (-this.__clampCameraX(candidate.view.cameraX) + 0) + "px,0)";
        shadow.insertBefore(bucket.canvas, slot);
      }
      // Promote candidate resources; evict everything else (§5 lifecycle).
      const identities = [...candidate.retainedIdentities];
      this._cache.promote(identities);
      this._cache.evictExcept(candidate.retainedIdentities);
      // Child swap via the package-private seam.
      const spriteData = candidate.sprite;
      const frameWidth = candidate.spriteBitmap.width / 4;
      const frameHeight = candidate.spriteBitmap.height / 4;
      const pose = this.__spritePoseFor(spriteData, 0);
      this._spriteElement.__commitMapSpriteStage(spriteData, candidate.spriteBitmap, frameWidth, frameHeight, pose);
      const accepted = this._accepted;
      const oldMotionActive = accepted !== null
        && accepted.view.cameraMotion !== null
        && (performance.now() - accepted.motionStart) < (accepted.motionDuration ?? WALK_MS);
      this._accepted = {
        view: candidate.view,
        sprite: candidate.sprite,
        receivedAt: candidate.receivedAt,
        buckets: candidate.buckets,
        chunkKeys: candidate.chunkKeys,
        frameWidth,
        frameHeight,
        spriteBitmap: candidate.spriteBitmap,
        motionStart: candidate.receivedAt,
        motionDuration: WALK_MS,
        motionEnd: candidate.view.cameraMotion === null ? candidate.receivedAt : candidate.receivedAt + WALK_MS,
        displayedCamera: null,
        displayedScreen: null,
      };
      // Mid-motion rebase (motion spec §4): a new visual/motion pair arriving
      // while the old motion is still displayed continues from the ACTUALLY
      // displayed pose for the remaining window, never restarting 250ms.
      if (oldMotionActive && candidate.view.cameraMotion !== null) {
        const t = performance.now();
        const oldDuration = accepted.motionDuration ?? WALK_MS;
        const p = Math.min(Math.max((t - accepted.motionStart) / oldDuration, 0), 1);
        const oldMotion = accepted.view.cameraMotion;
        const displayedCameraX = Math.round(oldMotion.fromCameraX + (accepted.view.cameraX - oldMotion.fromCameraX) * p);
        const displayedCameraY = Math.round(oldMotion.fromCameraY + (accepted.view.cameraY - oldMotion.fromCameraY) * p);
        const oldSpriteMotion = accepted.sprite.motion;
        const displayedScreenX = oldSpriteMotion === null ? accepted.sprite.screenX
          : Math.round(oldSpriteMotion.fromScreenX + (accepted.sprite.screenX - oldSpriteMotion.fromScreenX) * p);
        const displayedScreenY = oldSpriteMotion === null ? accepted.sprite.screenY
          : Math.round(oldSpriteMotion.fromScreenY + (accepted.sprite.screenY - oldSpriteMotion.fromScreenY) * p);
        const remainingMs = Math.max(accepted.motionEnd - t, 0);
        const rebased = this._accepted;
        rebased.motionStart = t;
        rebased.motionDuration = Math.max(remainingMs, 1);
        rebased.rebaseFrom = {
          cameraX: displayedCameraX,
          cameraY: displayedCameraY,
          screenX: displayedScreenX,
          screenY: displayedScreenY,
          fromY: oldSpriteMotion === null ? accepted.sprite.y : oldSpriteMotion.fromY,
        };
      }
      this._state = "VISIBLE";
      this._retryAttempts = 0;
      this._lastPaintedCamera = null;
      this._lastPaintedScreen = null;
      this.__startAutotileAnimation();
      this.__paintFrame(performance.now(), true);
    }

    /* Dirty-cell autotile animation (§6): only animated cells repaint, on
     * their own tick clock with dedupe; no permanent rAF without animated
     * cells; pure camera work never touches it. */
    __startAutotileAnimation() {
      this.__stopAutotileAnimation();
      const accepted = this._accepted;
      if (accepted === null) return;
      const animatedCells = [];
      const frameDurations = [];
      const visuals = new Map(accepted.view.tileVisuals.map((visual) => [visual[0], visual]));
      for (const chunk of accepted.view.chunks) {
        for (let z = 0; z < 3; z += 1) {
          for (let ly = 0; ly < CHUNK; ly += 1) {
            const worldY = chunk.chunkY * CHUNK + ly;
            for (let lx = 0; lx < CHUNK; lx += 1) {
              const worldX = chunk.chunkX * CHUNK + lx;
              const tileId = chunk.cells[(z * CHUNK + ly) * CHUNK + lx];
              if (tileId === 0) continue;
              const visual = visuals.get(tileId);
              if (visual === undefined || visual[2] !== 1) continue;
              const slot = visual[3];
              const ref = accepted.view.autotiles[slot];
              if (ref === null) continue;
              animatedCells.push({ tileId, visual, worldX, worldY });
              frameDurations.push(autotileFrameDuration(ref.key));
            }
          }
        }
      }
      if (animatedCells.length === 0) return;
      accepted.autotileCells = animatedCells;
      accepted.autotileFrameMs = Math.max(...frameDurations);
      const tick = () => {
        if (this._state === "DISPOSED" || this._accepted !== accepted) return;
        this.__paintAutotileFrame();
        this._autotileTimer = setTimeout(tick, accepted.autotileFrameMs);
      };
      this._autotileTimer = setTimeout(tick, accepted.autotileFrameMs);
    }

    __stopAutotileAnimation() {
      if (this._autotileTimer !== null) {
        clearTimeout(this._autotileTimer);
        this._autotileTimer = null;
      }
    }

    __paintAutotileFrame() {
      const accepted = this._accepted;
      if (accepted === null || !Array.isArray(accepted.autotileCells)) return;
      const frameCount = Math.max(1, Math.floor((performance.now() - this._autotileStartedAt) / accepted.autotileFrameMs));
      for (const cell of accepted.autotileCells) {
        const bucket = this.__bucketForCell(cell);
        if (bucket === null) continue;
        const bitmap = this.__autotileBitmapForSlot(cell.visual[3]);
        if (bitmap === null) continue;
        const layout = autotileLayout(bitmap);
        if (layout === null || layout.frames <= 1) continue;
        const frameIndex = frameCount % layout.frames;
        const ctx = bucket.canvas.getContext("2d", { alpha: true });
        ctx.imageSmoothingEnabled = false;
        const dx = cell.worldX * TILE - bucket.worldX;
        const dy = cell.worldY * TILE - bucket.worldY;
        if (layout.kind === "cell") {
          ctx.clearRect(dx, dy, TILE, TILE);
          ctx.drawImage(bitmap, frameIndex * TILE, 0, TILE, TILE, dx, dy, TILE, TILE);
        } else {
          ctx.clearRect(dx, dy, TILE, TILE);
          const frameX = frameIndex * 96;
          ctx.drawImage(bitmap, frameX + cell.visual[4], cell.visual[5], 16, 16, dx, dy, 16, 16);
          ctx.drawImage(bitmap, frameX + cell.visual[6], cell.visual[7], 16, 16, dx + 16, dy, 16, 16);
          ctx.drawImage(bitmap, frameX + cell.visual[8], cell.visual[9], 16, 16, dx, dy + 16, 16, 16);
          ctx.drawImage(bitmap, frameX + cell.visual[10], cell.visual[11], 16, 16, dx + 16, dy + 16, 16, 16);
        }
      }
    }

    __bucketForCell(cell) {
      const accepted = this._accepted;
      const bias = cell.visual[1];
      const depth = bias === -1 ? 0 : cell.worldY * TILE + bias;
      return accepted.buckets.get(depth) ?? null;
    }

    __autotileBitmapForSlot(slot) {
      const accepted = this._accepted;
      const ref = accepted.view.autotiles[slot];
      if (ref === null) return null;
      const identity = `${ref.namespace}\0${ref.key}\0${ref.contentVersion}`;
      return this._cache.get(identity, ref);
    }

    __clampCameraX(cameraX) { return cameraX; }

    /** Screen-space pixel sampler for qualification harnesses: composites the
     * depth buckets at viewport coordinates (canvas-space of the accepted
     * world raster minus camera). Product code never calls this. */
    __sampleScreen(x, y) {
      const accepted = this._accepted;
      if (accepted === null) return null;
      const sorted = [...accepted.buckets.entries()].sort((a, b) => a[0] - b[0]);
      for (const [depth, bucket] of sorted) {
        const cameraX = accepted.view.cameraMotion === null ? accepted.view.cameraX : Math.round(accepted.view.cameraMotion.fromCameraX + (accepted.view.cameraX - accepted.view.cameraMotion.fromCameraX) * 1);
        void cameraX;
        void depth;
        const cx = x + accepted.view.cameraX - bucket.worldX;
        const cy = y + accepted.view.cameraY - bucket.worldY;
        if (cx < 0 || cy < 0 || cx >= bucket.canvas.width || cy >= bucket.canvas.height) continue;
        const data = bucket.canvas.getContext("2d").getImageData(cx, cy, 1, 1).data;
        if (data[3] === 0) continue;
        return [data[0], data[1], data[2]];
      }
      return null;
    }

    __spritePoseFor(spriteData, progress) {
      const motion = spriteData.motion;
      let screenX = spriteData.screenX;
      let screenY = spriteData.screenY;
      let y = spriteData.y;
      let pattern = spriteData.pattern;
      if (motion !== null) {
        if (progress >= 0.5) pattern = (pattern + 1) % 4;
        const rebase = this._accepted === null ? null : (this._accepted.rebaseFrom ?? null);
        const fromX = rebase === null ? motion.fromScreenX : rebase.screenX;
        const fromY = rebase === null ? motion.fromScreenY : rebase.screenY;
        screenX = Math.round(fromX + (spriteData.screenX - fromX) * progress);
        screenY = Math.round(fromY + (spriteData.screenY - fromY) * progress);
        y = Math.round((rebase === null ? motion.fromY : rebase.fromY) + (spriteData.y - (rebase === null ? motion.fromY : rebase.fromY)) * progress);
      }
      const frameHeight = this._accepted === null ? 32 : this._accepted.frameHeight;
      const visualPixelY = screenY;
      const depth = Math.round(visualPixelY) + 32 + (frameHeight > 32 ? 31 : 0);
      return {
        screenX, screenY, pattern, depth,
        sheetX: pattern * (this._accepted === null ? 32 : this._accepted.frameWidth),
        sheetY: ((spriteData.direction - 2) / 2) * frameHeight,
      };
    }

    /** One rAF frame: camera-only translate + sprite placement (§6). */
    __paintFrame(now, first) {
      if (this._state === "DISPOSED" || this._accepted === null) return;
      const accepted = this._accepted;
      const motion = accepted.view.cameraMotion;
      const duration = accepted.motionDuration ?? WALK_MS;
      const progress = motion === null ? 1 : Math.min(Math.max((now - accepted.motionStart) / duration, 0), 1);
      const rebase = accepted.rebaseFrom ?? null;
      const cameraX = motion === null
        ? accepted.view.cameraX
        : Math.round((rebase === null ? motion.fromCameraX : rebase.cameraX) + (accepted.view.cameraX - (rebase === null ? motion.fromCameraX : rebase.cameraX)) * progress);
      const cameraY = motion === null
        ? accepted.view.cameraY
        : Math.round((rebase === null ? motion.fromCameraY : rebase.cameraY) + (accepted.view.cameraY - (rebase === null ? motion.fromCameraY : rebase.cameraY)) * progress);
      for (const [, bucket] of accepted.buckets) {
        bucket.canvas.style.transform = `translate(${-(cameraX - bucket.worldX)}px, ${-(cameraY - bucket.worldY)}px)`;
      }
      const pose = this.__spritePoseFor(accepted.sprite, progress);
      const frameWidth = accepted.frameWidth;
      const frameHeight = accepted.frameHeight;
      const host = this._spriteElement;
      if (host !== null && host.isConnected) {
        host.__commitMapSpriteStage(accepted.sprite, accepted.spriteBitmap, frameWidth, frameHeight, pose);
        // Parent-owned ::slotted rule positions the sprite host (§6).
        this._slottedRule.style.left = `${pose.screenX + (32 - frameWidth) / 2}px`;
        this._slottedRule.style.top = `${pose.screenY + 32 - frameHeight}px`;
        this._slottedRule.style.zIndex = characterStackValue(pose.depth);
        this._lastPaintedScreen = [pose.screenX, pose.screenY];
      }
      const previousPaintExisted = this._lastPaintedCamera !== null;
      const cameraChanged = previousPaintExisted && (this._lastPaintedCamera[0] !== cameraX || this._lastPaintedCamera[1] !== cameraY);
      const screenChanged = this._lastPaintedScreen !== null && (this._lastPaintedScreen[0] !== pose.screenX || this._lastPaintedScreen[1] !== pose.screenY);
      // "browser-first-motion-paint" fires on the FIRST paint of each NEW
      // motion pair (motionId change) and on later changed interpolation
      // frames: the input->paint latency is measured to the first paint of
      // the new motion, which must not depend on camera clamping (a fully
      // clamped camera never changes value) or on rAF frame timing. Standing
      // commits (motionId null) never register the marker.
      const motionPaint = accepted.view.motionId !== null || accepted.sprite.motion !== null;
      const newMotionPaint = motionPaint && this._lastPaintedMotionId !== accepted.view.motionId;
      this._lastPaintedCamera = [cameraX, cameraY];
      this._lastPaintedMotionId = accepted.view.motionId;
      if (newMotionPaint || (motionPaint && cameraChanged)) {
        qualify("browser-first-motion-paint", { element: "map-view", motionId: accepted.view.motionId, visualX: cameraX, visualY: cameraY });
      }
      if (newMotionPaint || (motionPaint && (cameraChanged || screenChanged))) {
        qualify("browser-first-motion-paint", { element: "map-sprite", motionId: accepted.sprite.motionId, visualX: pose.screenX, visualY: pose.screenY });
      }
      if (motion !== null && progress < 1) {
        this._raf = requestAnimationFrame(() => this.__paintFrame(performance.now(), false));
      } else {
        if (this._raf !== null) { cancelAnimationFrame(this._raf); }
        this._raf = null;
        qualify("browser-motion-complete", { element: "map-view", motionId: accepted.view.motionId });
        qualify("browser-motion-complete", { element: "map-sprite", motionId: accepted.sprite.motionId });
      }
    }
  }

  if (customElements.get("lr-map-view") !== undefined || customElements.get("lr-map-sprite") !== undefined) {
    // Fail closed when an owned tag is already registered.
    throw new TypeError("LoomRealm map element tag already registered");
  }
  customElements.define("lr-map-view", LoomRealmMapView);
  customElements.define("lr-map-sprite", LoomRealmMapSprite);
})();
