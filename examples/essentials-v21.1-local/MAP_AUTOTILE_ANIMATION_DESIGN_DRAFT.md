# Autotile 动画设计

> 状态：Draft for freeze  
> 目录：`examples/essentials-v21.1-local`  
> 对应缺口：`MAP_AUTOTILE_DESIGN_DRAFT.md` first-slice 已能投影并绘制 `tileId 48..383`，但 Browser 固定取 frame 0  
> 证据：本地 `[FSDB]Essentials v21.1` + `Maruno17/pokemon-essentials@ea7b5d56` 的 `AUTOTILE_FRAME_DURATION = 5`（1/20 秒单位 = 250ms）  
> 前置：layering / walking / map-transfer / autotile first-slice 已在 `main`

本文是 **动画这一刀** 的实施合同。不重开 first-slice 的 tile 分区、48-variant corners、block/cell 几何分类。

`MAP_DATA_FORMAT_REQUIREMENTS.md` 是上一版评审稿，不再作为实施依据。

---

## 1. 范围

只做一件事：已 decode 的 autotile 位图，按 250ms 沿横向切帧循环绘制。

不做：

- 改 Runtime / importer / RenderData / TileBlit / Save
- 动画帧进入玩法状态或跨图转移
- 通用 Timeline / AutotileService / 第二套 rAF / `setInterval`
- 文件名 `[x]` duration（当前 15 个 `autotile_names` 与 40 张 Autotiles PNG **均无** `[…]` suffix；需要时另开设计）
- 全存档格式审计脚本（first-slice 已对未知 tile/几何 fail-closed；不构成本刀完成条件）
- panorama / fog / hue / `tileId 1..47`

固定：

```js
const AUTOTILE_FRAME_MS = 250;
```

```text
block:  frameWidth = 96，frameCount = image.width / 96
cell:   frameWidth = 32，frameCount = image.width / 32
```

layout 分类仍是 first-slice 规则；整除已由分类保证，`frameCount` 为正整数。`frameCount === 1` 的槽保持静止。各槽按自己的 `frameCount` 取模，不共用最大帧数。

---

## 2. 文件边界

Production **只允许**改：

```text
game-libs/map/browser/map.browser.js
```

Tests **只允许**改：

```text
test/map-layering-browser.test.mjs
```

禁止改 `runtime.ts`、`semantics.ts`、`tools/**` production projection、`packages/**`。无法在上述范围表达则 STOP。

禁止新增 production 文件、class、exported type。

---

## 3. Authority

```text
Runtime：这个可见格是 slot S / variant V（corners 描述一帧内部 16×16 拼法）
Browser：slot S 的当前 PNG 有 N 帧；此刻画第 k 帧
```

同一份 RenderData 可随 presentation 时间重画；logical state 不变。walking / transfer / save 都不携带海面帧。

---

## 4. 帧公式

`LoomRealmMapView` 构造时：

```js
this._animationStartedAt = performance.now();
```

`receiveRenderData()` **不得**改这个值。每步 walking 都会换新 RenderData；若用 `receivedAt` 当动画起点，走一步海面就会跳回 frame 0。

```js
function autotileFrameIndex(now, startedAt, frameCount) {
  if (frameCount <= 1) return 0;
  return Math.floor((now - startedAt) / AUTOTILE_FRAME_MS) % frameCount;
}
```

只向前循环：`0 → 1 → … → N-1 → 0`。不做 ping-pong、不按进图时间重置。

绘制（相对 first-slice 只改取样 x）：

```text
k = autotileFrameIndex(now, this._animationStartedAt, frameCount)

block:  drawImage(image, k*96 + corner.sx, corner.sy, 16, 16, …)
cell:   drawImage(image, k*32, 0, 32, 32, …)
```

cell 仍忽略 corners。`corner.sy` 不变。

---

## 5. Browser 生命周期

继续复用 `_latestData`、`_paintEpoch`、`_raf`、`_images`。camera 的 `receivedAt` 只给 250ms lerp，与动画时钟无关。

### 5.1 接收

现有 RenderData validation 全部保留。

```text
_cancelRaf()
_latestData = data
_paintEpoch++
receivedAt = performance.now()    // 只给 camera
_paintLatest(data, receivedAt, epoch)
```

不重置 `_animationStartedAt`。

### 5.2 拆成一次 decode + 同步重画

当前 camera rAF 会再次进入 async `_paintLatest()`。动画要持续跑，decode 必须离开循环。

`_paintLatest()` 只做 first-slice 已有的 prepare：

```text
收集本 request 实际用到的 tileset / autotile refs
→ 无 refs 则同步进入 paint；有则 Promise.all
→ latest / epoch / isConnected
→ classify 每个已 decode autotile；invalid 则 _clearLayers 并 return
→ 调用同步 _paintPrepared(...)
```

禁止「decode 一张先画一点」。

`_paintPrepared()` 禁止 await / fetch / decode。每次入口先检查 `latest === requested && epoch && isConnected`，否则 return。

然后用 **同一次** `performance.now()`：

```text
camera：now - receivedAt（沿用 250ms lerp）
autotile：now - _animationStartedAt
```

再执行现有同步 paint（bucket / clear / draw / trim）。局部变量即可记住本轮各 slot 的 image、layout、frameCount；不要第三套 `animations` 结构或 exported `PreparedMapPaint`。

### 5.3 一个 rAF

```text
needsNextFrame =
  (cameraMotion 且 progress < 1)
  || (当前实际使用的任一 autotile frameCount > 1)
```

需要则：

```js
this._raf = requestAnimationFrame(() => {
  this._raf = undefined;
  this._paintPrepared(requested, receivedAt, epoch, prepared);
});
```

否则 `_raf = undefined`。单帧图在 camera 停后不得常驻 rAF。

rAF 回调进 `_paintPrepared`，不得再进 async decode。

### 5.4 无效重画（可选，非合同）

camera 像素与各 slot 的 `k` 都未变时，实现 **可以** 跳过 clear/bucket/draw，只决定是否继续 rAF。不冻结字符串 token、不要求必须 skip。

### 5.5 stale

`_clearLayers` / disconnect / epoch 规则与 first-slice 相同。新 RenderData 必须让旧 prepared rAF 因 epoch 不匹配而 return，不得盖住新图。

---

## 6. Tests

继续用现有 `test/map-layering-browser.test.mjs` harness（真实 `dist/browser/map.browser.js`、构造 PNG、delayed resource、观察 canvas / `_raf`）。不新造第二套 Playwright。

在该文件追加：

1. **cell 多帧**：160×32、5 个可区分 32×32；可见 frame 0 之后至少见到后续帧；取样始终是单格 32×32。
2. **block 多帧**：288×128、3 个 96×128；corners 组合不变，只是横向 base 换成 `k*96`。
3. **两槽不同 frameCount**：各自 modulo，不用全局最大帧。
4. **walking 不重置 phase**：动画进入非 0 帧后发带 `cameraMotion` 的新 RenderData；环境帧沿原 timeline，不跳回 0。
5. **transfer stale**：旧图 animated rAF 在新 epoch 后不再 paint；已有 delayed resource 晚到仍不得覆盖 latest。
6. **单帧 idle**：`cameraMotion === null` 且所有实际使用槽 `frameCount === 1` 时，paint 后 `_raf === undefined`。
7. **layering 回归**：现有 tile/sprite depth、多层 canvas 断言保留。

Cadence 断言用 `_animationStartedAt` + 假时钟或等到明确 canvas 像素变化；禁止靠固定长 sleep 碰运气。现有 stale image 测试不得删。

跑 browser test 前必须先 `npm test -w @loomrealm-game/map`（含 copy-browser），保证读到本次 `dist/browser/map.browser.js`。

---

## 7. Gates

```bash
npm test -w @loomrealm-game/map
node --test test/map-layering-browser.test.mjs
npm run test:fixtures
npm run test:m14
```

targeted 两条必须绿。后两条仅当 clean `main` 可复现的既有失败才可记 baseline exception；本刀引入的失败不许 exception。

**Feature implementation complete**：production diff 仅 §2 白名单，且 targeted + map package 绿，layering/stale 无新增失败。

---

## 8. Product Closed（不阻塞 Freeze）

`--force` 重导入真实 FSDB 后，窗口内至少：

1. Map066 ↔ Map067 门往返（无 autotile regression）
2. Map066 东缘 → Map002：Flowers1 可见且在动，可走回
3. Map039 一带：Sea / Sea deep 可见且在动
4. Map069：瀑布相关格可见且在动
5. Map070：水草 + Underwater dark 可见，有多帧的槽在动

以上 walking / 遮挡 / transfer 不回退。不要求保存 animation phase。

---

## 9. 抽象预算与实施顺序

禁止：`AutotileService`、`AnimationTimeline`、`MapClock`、paintToken 协议、filename duration parser、audit CLI、Browser↔Runtime 动画 ACK、第二套 timer。

允许新增的长期字段只有 `_animationStartedAt`。prepare 结果放在单次 paint 闭包里。

实施顺序：

```text
1. AUTOTILE_FRAME_MS + frameIndex；构造时记下 _animationStartedAt
2. receive 不重置该字段；camera 仍用 receivedAt
3. _paintLatest 只 decode 一次，交出同步 _paintPrepared
4. block/cell drawImage 加上 k * frameWidth
5. camera 或任一多帧槽 → 同一 _raf 进 _paintPrepared
6. 单帧且 camera 停 → 清 _raf
7. 扩展 map-layering-browser tests
8. 跑 §7
```

若第 1–6 步需要改 Runtime / semantics / importer：STOP，先回设计。

---

Freeze 后：implementation agent 无架构、schema、算法、文件范围、harness 或 gate 选择权。任一冻结规则无法按原文实现则 STOP，不得改设计。
