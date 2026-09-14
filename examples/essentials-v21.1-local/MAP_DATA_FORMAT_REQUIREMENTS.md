# 地图数据格式 / Autotile 动画设计草案

> 状态：Draft for review  
> 目录：`examples/essentials-v21.1-local`  
> 文件名暂沿用 `MAP_DATA_FORMAT_REQUIREMENTS.md`，但本文语义已从“需求清单”升级为“基于当前实现的设计草案”。  
> 证据基线：本地 Essentials v21.1 FSDB（`[FSDB]Essentials v21.1`，由官方 ZIP `--force` 导入）+ `Maruno17/pokemon-essentials@ea7b5d56` + 当前 `docs/map-autotile-adaptation` 分支实现。  
> 前置：layering / walking / map-transfer 已落地；`MAP_AUTOTILE_DESIGN_DRAFT.md` first-slice 已支持 `tileId 48..383`、48 variant、block / single-cell 两类 bitmap layout，但 Browser 仍固定绘制 frame 0。

本文设计目标只有两项：

1. 把已经能静态显示的 RMXP autotile 升级为 **Browser presentation-only 多帧动画**；
2. 对当前 Essentials v21.1 素材做一轮 **全地图数据格式闭环审计**，证明本存档实际出现的 tile/autotile 形态不会再因为格式不认识而关窗或整图失败。

本设计不重开 Runtime authority、MapTransfer、walking、layering，不新增通用 TileEngine，也不把动画帧写入 save/runtime state。

---

## 0. 当前实现与缺口

### 0.1 已经具备的数据链

当前 first-slice 已经形成：

```text
struct.Tileset.autotile_names[7]
  ↓
Runtime tileId partition
  ↓
TileBlit
  regular   → sourceIndex
  autotile  → slot + 48-variant corners
  ↓
MapViewRenderData
  tileset ResourceRef
  autotiles ResourceRef[7]
  visible tiles
  cameraMotion
  ↓
Browser
  decode current request resources
  classify autotile bitmap
  block | cell | invalid
  ↓
Canvas paint
```

其中：

- Runtime 已经知道某格属于哪个 autotile slot、哪个 48 variant；
- Browser 已经知道该 slot 对应的实际 PNG；
- Browser 已经能通过 bitmap 几何区分：
  - block：`height === 128 && width >= 96 && width % 96 === 0`；
  - single-cell：`height === 32 && width >= 32 && width % 32 === 0`；
- Browser 当前 block path 使用 Runtime 下发的四个 `16×16` corner；
- Browser 当前 single-cell path 直接画整格 `32×32`；
- 当前两条路径都固定从 `x = 0` 取样，因此永远停在 frame 0。

### 0.2 当前 Browser 生命周期

当前 `LoomRealmMapView.receiveRenderData()`：

```text
cancel current RAF
→ latestData = data
→ paintEpoch++
→ receivedAt = performance.now()
→ _paintLatest(data, receivedAt, epoch)
```

当前 `_paintLatest()`：

```text
collect currently required tileset/autotile refs
→ Promise.all decode
→ latest + epoch + connected check
→ classify layouts
→ calculate camera interpolation
→ paint all tile layers
→ cameraMotion 未结束时 requestAnimationFrame
   → 再次进入 _paintLatest()
```

这套 stale protection 是正确基础，但有两个缺口：

1. camera 每个 rAF 都重新进入 async decode path（虽然 `_images` 有 Promise cache）；
2. camera 停止后无 rAF，因此 autotile 无独立 presentation clock。

本设计把它收敛为：

```text
async prepare once
→ synchronous prepared paint loop
```

walking camera 和 autotile animation 共用同一个 `_raf`。

---

## 1. 本地真实数据边界

### 1.1 tileId 分区（当前 69 张 Map）

| 分区 | 含义 | 本存档出现量 | 设计处理 |
|---|---|---:|---|
| `tileId === 0` | empty | 103470 | 已支持，保持跳过 |
| `tileId 1..47` | RMXP 保留 / 本包未用 | 0 | 继续 fail closed |
| `tileId 48..383` | 7 槽 × 48 variant autotile | 6160 | 已支持静态；本刀补动画 |
| `tileId >= 384` | regular tileset | 61739 | 已支持，不改 |

含 autotile 格子的地图：

```text
2, 5, 7, 21, 23, 28, 31, 35, 39, 40,
41, 44, 45, 52, 68, 69, 70, 71, 72, 73
```

### 1.2 Autotile bitmap 几何

当前本地 `Graphics/Autotiles` 共 40 张 PNG，只有两类：

```text
block:
  height === 128
  width >= 96
  width % 96 === 0
  frameWidth = 96

single-cell:
  height === 32
  width >= 32
  width % 32 === 0
  frameWidth = 32
```

当前真实代表素材：

| 素材 | layout | 代表场景 |
|---|---|---|
| Sea / Sea deep / Sea without shore / Water rock / Fountain1 / Underwater dark | block | 海岸、喷泉、水下 |
| Flowers1 | single-cell `160×32` | Map002 |
| Waterfall / crest / bottom | single-cell `128×32` | Map069 |
| Seaweed dark / light | single-cell `128×32` | Map070 |

`Brown cave sand`、`Fountain2`、`Sand shore` 当前地图未引用，但既然已存在于合法 Tileset/material 库中，本设计的 layout/animation 算法不能依赖“当前没引用”来特殊跳过。

---

## 2. 架构决定

### 2.1 动画 authority 只在 Browser presentation

Autotile 动画帧不是 gameplay authority，不进入：

```text
Main Runtime state
Map runtime state
Frame outcome
MapTransfer
Save data
RenderData schema
TileBlit schema
```

authority 仍然是：

```text
Runtime:
  “这个可见格是 slot 4 / variant 34”

Browser:
  “slot 4 当前 bitmap 有 5 帧；此刻画第 N 帧”
```

因此：

- walking 不因为环境动画产生额外 Runtime tick；
- transfer 不需要转移动画状态；
- save/load 不保存海面当前帧；
- 同一 RenderData 在 Browser 端可随 presentation time 重画，但 logical state 没变化。

### 2.2 本刀不改 schema

以下 shape 继续保持 first-slice Frozen 合同：

```text
struct.Map
struct.Tileset
TileBlit
VisibleTile
MapViewRenderData
MapSpriteRenderData
```

特别是 `TileBlit.autotile.corners` 继续描述 **一帧内部** 的 48-variant quarter 组合；动画只改变源图横向 frame offset。

### 2.3 只允许一个 presentation scheduler

继续复用 `ResourceElement._raf`。

禁止新增：

```text
setInterval autotile timer
第二个 requestAnimationFrame controller
Runtime scheduler tick
AnimationTimeline
AutotileAnimator service
Browser→Runtime animation feedback
```

walking camera 与 autotile animation 都由同一个 MapView `_raf` 驱动。

---

## 3. Essentials v21.1 动画语义

权威基线：`pokemon-essentials@ea7b5d56` 的 `TilemapRenderer::AutotileBitmaps`。

### 3.1 默认节奏

Essentials v21.1：

```text
AUTOTILE_FRAME_DURATION = 5   // 1/20 秒单位
```

因此默认：

```text
5 / 20 second = 250ms per frame
```

本实现冻结为：

```js
const AUTOTILE_TICK_MS = 50;
const DEFAULT_AUTOTILE_FRAME_TICKS = 5;
```

### 3.2 文件名 `[x]` 覆盖

Essentials v21.1 支持 autotile 文件名末尾：

```text
[x]
```

表示每帧持续：

```text
x / 20 second
= x * 50ms
```

Browser 从 `ResourceRef.key` 的 basename 解析，不改 importer/schema。

推荐 helper：

```js
function autotileFrameDurationMs(ref) {
  const name = ref.key.slice(ref.key.lastIndexOf("/") + 1);
  const match = /\[\s*(\d+)\s*\]\s*$/.exec(name);
  if (!match) return DEFAULT_AUTOTILE_FRAME_TICKS * AUTOTILE_TICK_MS;
  const ticks = Number(match[1]);
  if (!Number.isSafeInteger(ticks) || ticks <= 0) return null;
  return ticks * AUTOTILE_TICK_MS;
}
```

Draft 规则：非法/0 duration suffix 视为 presentation-invalid；Freeze 前必须确认当前真实 material 是否存在这种名字。不得静默除零或制造 0ms busy loop。

### 3.3 每个 slot 自己决定 frameCount

```text
block:
  frameWidth = 96
  frameCount = image.width / 96

cell:
  frameWidth = 32
  frameCount = image.width / 32
```

因为 layout classifier 已要求整除，所以 `frameCount` 必须是正整数。

不同 slot 不共享 frameCount。

### 3.4 所有 slot 共享 presentation epoch

在 `LoomRealmMapView` 构造时：

```js
this._animationStartedAt = performance.now();
```

不要用每次 `receiveRenderData()` 的 `receivedAt` 作为 autotile 起点。

原因：walking 每步都会带来新 RenderData；若使用 `receivedAt`：

```text
走一步
→ receivedAt 重置
→ 所有 autotile 回到 frame 0
```

会产生明显卡顿/跳帧。

共享 presentation epoch 对齐 Essentials 的 renderer-lifetime `timer_start` 思路，也允许不同 duration / frameCount 的 slot 各自按公式推进。

### 3.5 frame 公式

```js
function autotileFrameIndex(now, startedAt, frameCount, durationMs) {
  if (frameCount <= 1) return 0;
  return Math.floor((now - startedAt) / durationMs) % frameCount;
}
```

动画只向前循环：

```text
0 → 1 → ... → N-1 → 0
```

不做 ping-pong、不做随机 phase、不按地图进入时间重置。

---

## 4. Browser 改造

生产实现原则上只修改：

```text
game-libs/map/browser/map.browser.js
```

### 4.1 新增局部 helper

允许增加：

```text
autotileFrameWidth(layout)
autotileFrameCount(image, layout)
autotileFrameDurationMs(ref)
autotileFrameIndex(now, startedAt, frameCount, durationMs)
```

不创建新 class/service。

### 4.2 `LoomRealmMapView` 新增长生命周期字段

constructor 增加：

```js
this._animationStartedAt = performance.now();
this._lastPaintToken = undefined;
```

继续复用继承来的：

```text
_latestData
_raf
_images
```

继续复用现有：

```text
_paintEpoch
```

不新增 animationId / animationEpoch / frame timer object。

### 4.3 `receiveRenderData()` 保持 authority 语义

现有 validation 完全保留。

接收新 RenderData 后：

```text
_cancelRaf()
_latestData = data
_paintEpoch++
_lastPaintToken = undefined
receivedAt = performance.now()       // 只给 camera motion
_paintLatest(data, receivedAt, epoch)
```

不要修改 `_animationStartedAt`。

### 4.4 `_paintLatest()` 只做 async prepare

当前 `_paintLatest()` 中以下逻辑保留：

```text
ensure first layer
collect current request actual required refs
Promise.all decode
latest/epoch/isConnected check
bitmap layout classification
```

之后不直接把整个 async function 当 animation loop。

构造一个局部 `prepared`：

```ts
interface PreparedMapPaint {
  tilesetImage?: ImageBitmap;
  autotileImages: Map<number, ImageBitmap>;
  layouts: Map<number, "block" | "cell">;
  animations: Map<number, {
    frameCount: number;
    frameWidth: 96 | 32;
    durationMs: number;
  }>;
}
```

这是文档表达 shape；实现保持 plain JS object/Map，不引入 exported type。

对每个 **当前 request 实际使用且已 decode** 的 autotile slot：

```text
layout      = classifyAutotileLayout(image)
frameWidth  = layout === block ? 96 : 32
frameCount  = image.width / frameWidth
durationMs  = autotileFrameDurationMs(ref)
```

若：

```text
layout === invalid
or durationMs === null
```

则沿用当前 presentation fail-closed：

```text
if request still latest:
  _clearLayers()
return
```

准备完成后唯一调用：

```text
_paintPrepared(requested, receivedAt, epoch, prepared)
```

### 4.5 `_paintPrepared()` 必须是同步 paint loop

`_paintPrepared()` 内禁止 await / resource fetch / image decode。

每次进入先检查：

```text
_latestData === requested
&& epoch === _paintEpoch
&& isConnected
```

否则立即 return。

然后：

```text
now = performance.now()

cameraMotion:
  仍用 now - receivedAt
  仍沿用 250ms lerp

autotile frames:
  用 now - _animationStartedAt
  每 slot 独立 frameCount/durationMs
```

### 4.6 block 绘制

现有 48 variant `corners` 不变。

对当前 slot：

```text
frameX = frameIndex * 96
```

原：

```js
drawImage(image, corner.sx, corner.sy, 16, 16, ...)
```

改为：

```js
drawImage(image, frameX + corner.sx, corner.sy, 16, 16, ...)
```

TL/TR/BL/BR 全部一样只增加 `frameX`。

`corner.sy` 不变。

### 4.7 single-cell 绘制

对当前 slot：

```text
frameX = frameIndex * 32
```

原：

```js
drawImage(image, 0, 0, 32, 32, dx, dy, 32, 32)
```

改为：

```js
drawImage(image, frameX, 0, 32, 32, dx, dy, 32, 32)
```

single-cell 仍然不解释 corners；slot/ResourceRef/validation 仍来自 Runtime RenderData。

### 4.8 一个 RAF 同时服务 camera 与 autotile

本轮是否继续 rAF：

```text
cameraAnimating = cameraMotion && progress < 1
hasAnimatedAutotile = 任一当前实际使用 slot 的 frameCount > 1

needsNextFrame = cameraAnimating || hasAnimatedAutotile
```

若需要：

```js
this._raf = requestAnimationFrame(() => {
  this._raf = undefined;
  this._paintPrepared(requested, receivedAt, epoch, prepared);
});
```

否则：

```js
this._raf = undefined;
```

单帧地图在 camera 停止后不得保持永久 RAF。

### 4.9 paint token：不做无效 60fps Canvas 重画

即使 animated map 要持续 rAF 观察时间，也不需要每个屏幕刷新周期重画 Canvas。

每次 prepared paint 计算：

```text
frameToken = 当前实际使用 slot 的 slot:frameIndex
paintToken = epoch | cameraX,cameraY | frameToken
```

例如：

```text
31|64,96|0:1,3:0,4:2
```

若：

```text
paintToken === _lastPaintToken
```

则：

```text
不 clear canvas
不 bucket/draw/trim
只根据 needsNextFrame 决定是否继续 RAF
```

若不同：

```text
_lastPaintToken = paintToken
执行现有完整同步 paint transaction
```

`epoch` 必须进入 token，确保不同 RenderData 即使 camera/frame 恰好相同也会重画。

### 4.10 clear / disconnect / stale

`_clearLayers()` 增加：

```js
this._lastPaintToken = undefined;
```

`ResourceElement.disconnectedCallback()` 继续只需 `_cancelRaf()`。

新的 prepared loop 必须保留 epoch/latest check，因此：

```text
old map prepared RAF
→ new RenderData paintEpoch++
→ old callback sees epoch mismatch
→ return
```

旧 map 的 animation 不得在 transfer 后重新覆盖新 map。

### 4.11 decode transaction 不能退化

必须继续：

```text
collect all resources needed by current request
→ Promise.all complete
→ latest check
→ classify all used autotiles
→ only then first paint
```

禁止：

```text
await 一个 autotile → 先画一点
await 第二个 autotile → 再补
```

因此资源慢返回/失败时，不会留下 half-old / half-new partial stale canvas。

---

## 5. Runtime / Importer 明确 0 改动

本设计正常实施时以下 production 文件必须保持 0 diff：

```text
game-libs/map/src/runtime.ts
game-libs/map/src/semantics.ts
tools/fixtures/essentials-v21.1/lib/essentials/v21.1/m14-consumer.mjs
tools/fixtures/essentials-v21.1/lib/essentials/v21.1/simple-game-data.mjs
packages/**
```

理由：

- Runtime 已经提供 slot + corners；
- Tileset 已经提供 7 个 autotile resource names；
- Browser 已经拥有实际 bitmap width/height；
- frameCount/duration/frameIndex 全是 presentation facts。

如果 implementation 发现必须修改上述任一文件，说明设计边界可能不成立：**STOP，先回设计审阅，不得自行扩大 schema/authority。**

---

## 6. 全存档地图格式闭环

动画正确不等于“69 张图格式全部闭环”。本设计额外增加一个 local-only real-material audit。

建议文件：

```text
scripts/map-data-format-essentials-local.mjs
```

它不是 M14/M15 qualification，不写进 protocol contract，不替换真人 Product Closed。

### 6.1 Audit 必须证明

对当前真实 Essentials v21.1 material：

```text
全部 struct.Map
→ Map/Tileset 结构合法
→ projectability 成立
→ 所有实际使用 autotile slot 有非空 name
→ 对应 Graphics/Autotiles resource 存在
→ PNG dimensions 可读取
→ geometry 属于 block 或 single-cell
→ frameCount 是正整数
→ 不存在实际使用的第三种 geometry
```

并统计：

```text
map count
autotile map ids
tileId 0 / 1..47 / 48..383 / >=384 counts
实际使用 autotile names
bitmap dimensions
animated frame counts
unsupported count
missing resource count
```

期望当前基线仍与 Section 1 一致：69 maps、20 张含 autotile、`1..47` 使用量 0。

### 6.2 PNG dimensions

Audit 不需要 decode/render PNG，也不新增图片依赖。

允许直接读 PNG header：

```text
validate 8-byte PNG signature
first chunk type must be IHDR
width  = bytes 16..19 big-endian uint32
height = bytes 20..23 big-endian uint32
```

这只做 material audit；Browser 生产代码仍以 `ImageBitmap.width/height` 为准。

### 6.3 Audit 不能替代 Browser test

Audit 只能证明：

```text
数据/资源形态在支持集合内
```

Browser test 必须另外证明：

```text
实际 frame offset
RAF 生命周期
walking 不重置 phase
stale transfer 不污染 latest
layering 不回退
```

### 6.4 当前 Draft 的一个 Freeze Gate

Freeze 前需要把 local audit 的 **exact FSDB record enumeration seam + exact CLI** 写死。

优先复用现有 Essentials local/import tooling；禁止为 audit 新增 framework listing API。

候选 CLI：

```bash
node scripts/map-data-format-essentials-local.mjs --source <Essentials-v21.1.zip-or-dir>
```

实现 agent 在 Frozen 前不得自行选择“直接扫生成目录”还是“经 production FSDB reader 枚举”；该决定必须先在文档里关闭。

---

## 7. Browser regression 测试

继续使用现有：

```text
test/map-layering-browser.test.mjs
```

不要新造第二套 Playwright harness。

当前 harness 已经能：

- 启动真实 `dist/browser/map.browser.js`；
- 构造 PNG；
- 注入 delayed resource Promise；
- 观察 Canvas、layer z-index、sprite z-index、`_raf`、`_images`；
- 验证 stale image race。

本刀在该文件追加以下测试。

### 7.1 single-cell 多帧

构造：

```text
160×32 PNG
5 个 32×32 横向 frame
每帧明显不同颜色
ResourceRef key 可使用：Autotiles/Test Flowers [1]
```

`[1]` 使测试 cadence 为 50ms，避免每例等待默认 250ms。

断言：

```text
frame 0 可见
随后 frame 1/2 至少一次可见
循环后仍只取单个 32×32 frame
```

### 7.2 block 多帧

构造：

```text
288×128 PNG
3 个 96×128 frame
每个 frame 对同一 corner 区域填不同颜色
```

给一个确定 autotile `corners`。

断言 frame 切换时四角仍保持 variant 组合，只改变横向 96px frame base。

### 7.3 同图不同 slot 不同 frameCount

至少同时使用：

```text
slot A: 5-frame cell
slot B: 4-frame cell 或 block
```

断言各自 modulo 自己的 frameCount，不使用全局最大帧数。

### 7.4 walking RenderData 不重置 autotile phase

步骤：

```text
让 autotile 进入非 0 frame
→ 发送带 cameraMotion 的新 RenderData
→ animationStartedAt 不变
→ 环境 frame 按原 timeline 继续
```

禁止走一步就回 frame 0。

### 7.5 transfer/latest stale regression

步骤：

```text
old map animated prepared loop running
→ receive new map RenderData
→ old epoch invalid
→ old RAF callback 不再 paint
```

并保留已有 delayed resource：

```text
old resource late resolve/reject
→ latest canvas 不被覆盖/clear
```

### 7.6 单帧 idle 不永久 RAF

当当前地图：

```text
cameraMotion === null
所有实际使用 autotile frameCount === 1
```

paint 后必须：

```text
_raf === undefined
```

### 7.7 layering 回归

现有：

```text
tile depth
sprite depth
moving depth
multiple tile layer
```

断言继续保留，不因 animation paint loop 改 z-index / canvas order。

---

## 8. 文件范围

### 8.1 Production whitelist

原则上仅：

```text
game-libs/map/browser/map.browser.js
```

### 8.2 Test / local tooling whitelist

```text
test/map-layering-browser.test.mjs
scripts/map-data-format-essentials-local.mjs      # new；Freeze 后 exact seam 才实施
```

### 8.3 Documentation

```text
examples/essentials-v21.1-local/MAP_DATA_FORMAT_REQUIREMENTS.md
```

### 8.4 Forbidden expansion

未经设计重审不得修改：

```text
game-libs/map/src/runtime.ts
game-libs/map/src/semantics.ts
tools/fixtures/** production projection
packages/**
MapTransfer schema/state machine
save schema
Renderer protocol
```

也禁止新增：

```text
AutotileService
AnimationTimeline
MapClock
Browser/Runtime animation ACK
额外 timer queue
```

---

## 9. 机械实施顺序

implementation agent 在设计 Frozen 后按此顺序施工：

1. 在 `map.browser.js` 增加 frame width/count/duration/index 四个局部 helper；
2. `LoomRealmMapView` 增加 `_animationStartedAt`、`_lastPaintToken`；
3. 保持 `receiveRenderData` validation，不重置 animation epoch；
4. 把 `_paintLatest()` 收敛为一次 async resource prepare；
5. 新增同步 `_paintPrepared()`，移入 camera calculation、bucket、layer paint；
6. block path 增加 `frameIndex * 96`；
7. cell path 增加 `frameIndex * 32`；
8. camera/autotile 共用 `_raf`；
9. 增加 paint token，避免未换 frame 时重复 Canvas paint；
10. `_clearLayers()` reset paint token，保留 stale/latest/epoch checks；
11. 在现有 browser test harness 补 Section 7 cases；
12. 关闭 Section 6.4 Freeze Gate 后实现 local all-map audit；
13. 跑 Section 10 gates；
14. `--force` 重导入真实 Essentials material，执行 Section 11 真人验收。

若第 1–10 步需要改 Runtime/semantics/importer：STOP。

---

## 10. Gates

### 10.1 Targeted implementation gates

```bash
npm test -w @loomrealm-game/map
node --test test/map-layering-browser.test.mjs
```

`@loomrealm-game/map` 的 `npm test` 已包含 build，因此 browser test 读取的 `dist/browser/map.browser.js` 必须来自本次源码。

### 10.2 Broader regression gates

```bash
npm run test:fixtures
npm run test:m14
```

如果 broad gate 在与本 diff 无关的历史测试失败：

- 必须在 clean base 上复现同一失败才可记录 baseline exception；
- 不得为了让本功能“变绿”顺手修 framework/M12/M13/M14 无关问题；
- targeted feature gate 自己引入的失败不允许 exception。

### 10.3 Local real-material audit

Freeze 后补 exact command；候选：

```bash
node scripts/map-data-format-essentials-local.mjs --source <Essentials-v21.1.zip-or-dir>
```

必须输出 machine-readable 或至少 deterministic summary，unsupported/missing 必须 non-zero exit。

---

## 11. Product Closed 真人场景

重导入真实 FSDB 后：

```text
node scripts/init-fsdb.mjs --force
```

在真实示例窗口至少走：

1. **无 autotile regression**：Map066 ↔ Map067 门往返正常；
2. **single-cell 户外**：Map066 东缘 → Map002，Flowers1 可见且连续动画，可走回；
3. **block 水面**：Map039 一带 Sea / Sea deep 可见且多帧在动；
4. **瀑布**：Map069 Waterfall / crest / bottom 可见且多帧在动；
5. **水下混合**：Map070 Seaweed + Underwater dark 可见，有多帧的 slot 在动；
6. 以上场景 walking、遮挡、transfer 均不出现 regression。

Product Closed 不要求保存具体 animation phase；如果读档能力之后落地，只要求进入目标图后动画正常继续运行。

---

## 12. 完成判读

### 12.1 Feature implementation complete

必须同时满足：

```text
Production diff 仍在 Section 8 白名单
Browser targeted animation tests 通过
map package tests 通过
walking/layering/stale regression 无新增失败
```

### 12.2 Data-format closed

在 Feature implementation complete 基础上再满足：

```text
real-material all-map audit PASS
0 unsupported actual tile formats
0 missing actually-used autotile resources
0 unsupported actually-used bitmap geometries
```

### 12.3 Product Closed

再加 Section 11 真人 5 类地图全部成立。

---

## 13. Freeze Gates

本文当前仍是 Draft，不直接交低判断力 agent 实施。Freeze 前只剩以下设计证据需要关闭：

1. **local audit exact seam**：确定如何从 importer/FSDB production path 枚举全部 `struct.Map` / `struct.Tileset` / `resource.Graphics`，并写死新脚本 CLI；不得让 implementation agent 自选读取层。
2. **filename duration inventory**：扫描当前真实 `autotile_names`，确认是否存在 `[x]` suffix，尤其 `[0]`/非法数字；把真实结果写入本文。
3. **exact audit output baseline**：`--force` 重导入后重新记录 map count、20 张 autotile map、40 张 PNG、两类 geometry 是否仍与 Section 1 完全一致。
4. **最终 scope freeze**：关闭以上三项后，把 Section 8 从“原则上/建议”改成唯一允许文件集合，并将状态改为 `Frozen for implementation`。

Frozen 版必须加入：

```text
Implementation agent has no architecture, schema, algorithm,
file-scope, harness or gate discretion.
If any frozen rule cannot be implemented exactly:
STOP and report blocker. Do not redesign.
```

在这四项关闭前，不允许仅把标题改成 Frozen。
