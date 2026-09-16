# 地图移动延迟与呈现性能改造草案

> 状态：Draft for review  
> 日期：2026-09-15  
> 目录：`examples/essentials-v21.1-local`  
> 目标：降低方向键到首个可见运动的延迟，保留整数格 authority、碰撞和地图切换语义，并消除正常本地链路下的跳格现象

本文是对当前 walking 实现的改造提案，不是已冻结的实施合同。评审通过并 Freeze 后，本文明确覆盖 `MAP_WALKING_ANIMATION_DESIGN_DRAFT.md` 中以下旧规则：

- 固定 `250ms/格`；
- Browser motion `durationMs === 250` 的校验；
- 快速转向只能依靠按键在 completion boundary 时仍保持按下；
- camera motion 期间每个 rAF 重画全部可见 tile。

未被本文明确覆盖的 authority、碰撞、held precedence、transfer、layering、stale-resource 和最终收敛规则继续有效。

`MAP_AUTOTILE_ANIMATION_DESIGN_DRAFT.md` 中的“一次异步 prepare + 同步 `_paintPrepared()` + MapView 单一 rAF”是本改造的前置结构；两份文档冲突时，应先合并成一份冻结合同，不允许实施者自行选择。

---

## 1. 当前问题

### 1.1 用户可见症状

当前实现可能出现三类不同现象，诊断和验收必须分开：

1. **首动延迟**：按下方向键后，人物迟迟没有开始移动。
2. **转向延迟**：人物正在走一格时按下另一方向，要等当前格结束才转向。
3. **跳格**：人物直接从起点出现在终点，没有可见的中间像素和步态切换。

其中转向等待 completion boundary 是当前明确设计；Runtime 没有逐像素中间状态也是明确设计。Browser 应根据一条 walking RenderData 在本地生成中间像素，如果画面仍然跳格，则属于传输、调度或绘制问题。

### 1.2 当前时序

```text
trusted keydown
  → Renderer Input Source
  → input.state + input.event
  → Data WebSocket
  → map Runtime attempt()
  → 立即提交 target x/y
  → RenderDomain.replace(walking snapshot)
  → Runtime 启动 250ms step timer
  → Data WebSocket
  → Renderer Store / Web Projector
  → MapView + MapSprite receiveRenderData()
  → Browser 从“收到数据的时刻”开始 rAF 插值
  → Runtime timer 到点后发送下一 walking 或 standing snapshot
```

Runtime timer 与 Browser 实际开始绘制没有握手。Render transport 又是 latest-state projection：同一 domain 尚未发送的 snapshot 可以被更新状态覆盖。因此链路繁忙时允许出现：

```text
walking snapshot 尚未呈现
  → 250ms timer 已完成
  → standing/newer walking 到来
  → walking 中间视觉被缩短或完全跳过
```

### 1.3 本地基线证据

2026-09-15 对当前 Map066、出生点附近做静态测量：

| 项目 | 当前值 |
|---|---:|
| 地图大小 | `22 × 21 × 3` |
| 单次投影的非空可见 tile | 约 `408` |
| 单次完整 RenderSnapshot JSON | 约 `36 KiB` |
| Runtime 步长 | `250ms` |
| 理论连续步频 | `4 格/秒` |
| 转向额外等待 | `0..250ms`，平均约 `125ms` |

当前独立 Browser tests 能证明直接注入 motion 时，四 pattern 和像素插值算法可以工作；它们没有覆盖真实的“trusted keydown → Runner → WebSocket → Renderer → first paint”端到端时间，也没有用 Map066 的四百多个 tile 做帧预算测试。

---

## 2. 改造目标与非目标

### 2.1 必须达到

在发布构建、资源已完成首屏加载、窗口可见且获得焦点的条件下：

| 指标 | 目标 |
|---|---:|
| 方向键 keydown → 首个位置变化，P95 | `≤ 50ms` |
| 连续移动单格时长 | `160ms` |
| 持续按键时相邻步之间的视觉停顿，P95 | `≤ 1 frame` |
| 转向 keydown → 新方向开始移动 | 不晚于当前 step 的下一个 boundary |
| 活跃移动期间长帧比例（> 33.4ms） | `< 1%` |
| 正常本地链路中的完整跳格 | `0` |

指标必须由自动化时间线或 trace 采集，不以“肉眼感觉更快”作为唯一证据。

### 2.2 保持不变

- Runtime `x/y` 是整数目标格 authority；Browser 不决定碰撞和 transfer。
- 一次成功 step 仍走完整格；keyup 不把人物停在半格。
- walking 中路径方向在格边界切换，不允许视觉预测穿墙。
- collision 保持原坐标，并立即显示 attempted direction 的 standing pattern。
- held direction 的“最后按下优先”规则不变。
- transfer 仍只在既有 contact、edge 或 completed-step boundary 触发。
- stale async image、旧 motion 和旧 map 不得覆盖 latest state。
- 不把逐像素坐标、autotile frame 或每个 rAF tick 写回 Runtime/Save。

### 2.3 本轮不做

- 跑步、自行车、冲浪、跳跃、NPC/Event movement。
- 通用 GameLoop、Tween、AnimationManager 或跨游戏的 motion protocol。
- 为每一帧建立可靠消息队列或 ACK。
- 通过提高 Electron timer 优先级、busy loop 或关闭校验掩盖问题。
- 为性能而降低碰撞、地图、资源或 RenderData 的安全校验强度。

---

## 3. 决策概览

改造分为四刀，每刀必须独立测量。不得在没有证据时直接进入 framework 改造。

```text
A. 建立端到端时间线和真实地图性能基线
  ↓
B. 160ms cadence + 一次格边界方向缓冲
  ↓
C. Browser prepare/cache + 只更新发生变化的视觉量
  ↓
D. 若 P95 仍不达标，再评审 Render patch / scene state 拆分
```

切片 A～C 只涉及 map game library、Desktop E2E harness 和 local 启动脚本。切片 D 会重开 framework contract，必须另立 ADR，不能作为 A～C 的顺手重构。

---

## 4. 切片 A：测量与构建一致性

### 4.1 时间线观测点

开发/测试模式至少记录以下单调事件，统一关联 `moveId`：

```text
input-captured
runtime-input-received
runtime-motion-published
renderer-motion-received
browser-first-motion-paint
browser-motion-complete
runtime-step-complete
```

跨进程不可直接比较来源不一致的 `performance.now()`。端到端测试应由同一测试进程记录可比较时间，或使用 wall-clock trace 并只把它用于诊断；production RenderData 不新增 wall-clock 字段。

正式实现不得无条件打印每帧日志。允许：

- test harness 回调；
- qualification-only hook；
- 显式环境开关控制的稀疏事件日志。

禁止在每个 rAF 输出 console log，因为日志本身会改变帧延迟。

### 4.2 新增端到端用例

至少覆盖：

1. 从 standing 按下方向键，测 keydown 到第一个非起点像素。
2. 持续按住同一方向四格，断言步间没有 standing frame。
3. 当前 step 中途按下另一方向并保持，断言恰好在下一 boundary 转向。
4. 当前 step 中快速点按另一方向后松开，覆盖 §5.3 的一次缓冲。
5. keyup 后只走完当前格，不额外直行一格。
6. 人为延迟 Render carrier，证明 latest-state 最终收敛，并明确记录是否发生视觉降级。
7. 使用 Map066 真实规模 tile payload 跑 120 个 animation frame，统计长帧而不是只用一张 tile。

### 4.3 构建一致性

当前 `play.bat` 只在 Desktop entry 不存在时执行构建，不能证明 `game-libs/map/dist` 与 source 一致；FSDB 内的 presentation 文件也只在导入时复制。

local 启动必须在以下方案中冻结一个：

- 启动前执行 map/desktop 增量 build，并把当前 browser presentation 同步到既有 FSDB；或
- 比较 source、dist、FSDB presentation 的内容哈希，不一致时中止并给出修复命令。

不允许静默启动 source、dist、FSDB 三者版本不一致的窗口。

---

## 5. 切片 B：控制手感

### 5.1 步长

第一版固定：

```ts
const WALK_STEP_MS = 160;
```

`160ms` 同时用于：

- Runtime step completion timer；
- player motion duration；
- camera motion duration；
- Browser test fake clock；
- 性能和端到端验收窗口。

不允许只改 Runtime timer 或只改 Browser duration。

### 5.2 Browser duration 校验

当前 Browser 把 `durationMs === 250` 当作合法性的组成部分，使 RenderData 中已有的 duration 字段实际上不可变。本改造改为兼容区间：

```text
durationMs 是 safe integer
80 <= durationMs <= 1000
```

Runtime 本刀只发送 `160`。区间校验只是让 presentation contract 与字段语义一致，不代表本刀实现地形速度、跑步或动态调速。

Runtime 同一次 `renderState()` 产出的 MapView `cameraMotion.durationMs` 与 MapSprite `motion.durationMs` 必须相等，且两者 `id` 必须相等。这个跨节点约束由 Runtime tests 验证；两个 Browser custom element 仍只校验各自收到的数据，不为交叉校验增加组件耦合。

### 5.3 一次格边界方向缓冲

仅靠 `heldDirections` 会丢掉“walking 中按下新方向、到 boundary 前已经松开”的快速转向。增加一个极小、确定性的 buffer：

```ts
interface BufferedTurn {
  readonly direction: Direction;
  readonly observedDuringMoveId: number;
}

let bufferedTurn: BufferedTurn | null = null;
```

规则：

- standing keydown：沿用立即 `attempt()`，不写 buffer。
- walking 中非-repeat keydown：照常更新 `heldDirections`；若方向不同于当前 active move 的路径方向，覆盖 `bufferedTurn`。
- keyup：立即从 `heldDirections` 删除，但不删除已经记录的不同方向 buffer。
- completion boundary：先消费属于当前 `moveId` 的 `bufferedTurn`；没有有效 buffer 时再选择当前最高 held direction。这样持续按住原方向时快速点按一个新方向，仍会在边界转向一次。
- buffer 无论成功、碰撞、transfer、abort 或被消费，随后都清空。
- 同方向的短按不得形成额外直行一步，避免破坏“keyup 后只走完当前格”。
- buffer 最多保存一个方向，不新增 timer，不形成 command queue。

`ActiveMove` 需要保存本步路径方向，以区分视觉路径和下一步 intent：

```ts
interface ActiveMove {
  readonly id: number;
  readonly fromX: number;
  readonly fromY: number;
  readonly direction: Direction;
  readonly startPattern: 1 | 3;
}
```

walking 中仍不修改当前 step 的 `x/y/path direction/motion`，也不因普通 intent 更新发送 RenderState。转向只在 completion boundary 生效，因此不会出现斜滑或预测穿墙。

### 5.4 首次输入

standing 状态收到合法 keydown 后必须同步执行 `attempt()` 和 `domain.replace(walking)`。不得增加 debounce、等待 OS repeat 或等待下一次 `keyboard.state`。

若端到端首动仍超过 50ms，优先修复 input/data/render/paint 链路，不得通过让 Runtime 提前提交未知输入来“抵消”延迟。

---

## 6. 切片 C：Browser 呈现性能

### 6.1 一次 prepare，同步 animation loop

沿用 autotile animation draft：每次新 RenderData 最多执行一次异步 resource prepare。rAF 回调只进入同步 paint，不得重复进入 `Promise.all`、resource lookup 或 decode。

```text
receiveRenderData
  → cancel/retire old epoch
  → async prepare once
  → latest/epoch/connected guard
  → synchronous paintAt(now)
      → schedule next rAF only when needed
```

### 6.2 地图层缓存

当前 camera motion 的每个 rAF 都会重新：

- 创建 depth buckets；
- clear 全部 canvas；
- 遍历约四百个 tile；
- 对 regular tile draw 一次、对 block autotile 最多 draw 四次。

改造后，每个 depth layer 保存本次 prepared state 的 backing bitmap 和 world origin：

```text
prepare/rebuild 时：tile data → backing canvas
camera rAF 时：只更新 layer transform/offset
autotile frame 变化时：仅重画受动画影响的 backing layer
```

约束：

- backing 区域必须覆盖 Runtime 已投影的 overscan；camera 从 source 到 target 的全程不得露出未绘制空白。
- layer 的 z-index、depth 分组和透明清理语义保持不变。
- mapId、tile payload、resource identity、layout 或 paint epoch 变化时重建对应 cache。
- stale prepare 不能触碰 live canvas。
- cache 不成为 authority；断开、换图或资源失败后可完全丢弃并从最新 RenderData 重建。

### 6.3 Player 绘制

人物每帧变化的只有位置；source pattern 在半步边界才变化。

改造为：

- 新 sprite identity、direction 或 pattern 改变时才 clear/draw character canvas；
- 每个 rAF 只通过 CSS transform/position 更新人物位置和必要的 depth；
- 不在每帧重新设置 `canvas.width`、`canvas.height`；
- movement id 未变化时，重复 delivery 不得把 motion 起点重置为新的 `receivedAt`。

如果同一 motion id 收到更新：沿用原 motion timeline，只更新 latest target/presentation facts；新 motion id 才建立新 timeline。standing 仍立即结束旧 motion并收敛到权威 target。

### 6.4 时间一致性

一次 paint 使用同一个 `now = performance.now()` 计算 camera、player pattern、player position 和 autotile frame。若现有 Web Component 边界无法让 MapView 统一驱动 Player，则允许两者保持各自 rAF，但必须满足：

- 相同 motion id 的起始帧差不超过一个 animation frame；
- camera 与 player 到达终点的时间差不超过一个 animation frame；
- 不为同步而建立 Browser→Runtime feedback。

只有测量证明双 rAF 是剩余瓶颈时，才允许让 MapView 协调其直属 `lr-map-sprite`；不得先引入全局 AnimationManager。

### 6.5 空闲成本

以下条件同时成立时不得保留 walking rAF：

```text
camera motion 已结束
player motion 已结束
没有需要当前帧继续推进的 presentation animation
```

多帧 autotile 可以继续使用 MapView 已有的单一 rAF，但只在 autotile frame index 变化时重画 tile backing，不应以 60Hz 重画相同水面帧。

---

## 7. Runtime 投影与传输成本

### 7.1 A～C 允许的局部优化

`projectVisibleTiles()` 的结果可按以下 identity memoize：

```text
mapId + camera projection bounds + tileset identity
```

同一个可见窗口内的 standing/walking render 可以复用 frozen tile array，减少 Runtime 分配和重复投影。memoization 必须在 map transfer 时失效，且不得绕过 `assertProjectable()` 和资源校验。

这项优化减少 Runtime CPU/GC，但当前 Snapshot codec 仍会序列化完整 RenderData，因此不能把它宣传为带宽优化。

### 7.2 降级规则

在 A～C 中继续接受 latest-state transport 的最终收敛语义：极端 backpressure 下允许跳过视觉 transition，但必须保留正确的最新坐标、方向、地图和碰撞结果。

正常本地、无故障、队列未达到容量限制的链路不应发生跳格。如果 trace 证明 walking snapshot 在 normal load 下被后继 snapshot 合并，必须视为性能失败，而不是用“协议允许降级”关闭问题。

### 7.3 Framework 改造触发条件

完成 A～C 后，若满足任一条件，才进入切片 D：

- keydown → renderer receipt 的 P95 已占 50ms 预算的大部分；
- normal load 下仍能稳定复现 walking snapshot 被覆盖；
- snapshot encode/decode/store/projector 的 CPU 或 GC 是已测得主瓶颈；
- 单 subsystem 的持续 RenderSnapshot 带宽随地图规模不可接受增长。

切片 D 候选方向：

1. Subsystem RenderManager 正式发送已有协议的 node/data patch；
2. 把低频 scene state 与高频 actor motion 拆成可独立更新的节点数据；
3. 为 motion 定义可恢复的 retained timeline state，而不是不可恢复 command event。

切片 D 必须另写 ADR，说明 patch baseline、revision、重连恢复、coalescing、安全校验和 qualification；不得把 walking motion 改成无界 RenderEvent 队列。

---

## 8. 文件范围

### 8.1 切片 A～C production

允许修改：

```text
game-libs/map/src/runtime.ts
game-libs/map/src/semantics.ts                 // 仅投影 cache 所需时
game-libs/map/browser/map.browser.js
examples/essentials-v21.1-local/play.bat
examples/essentials-v21.1-local/scripts/*.mjs // 仅构建/哈希一致性
```

### 8.2 Tests

```text
game-libs/map/test/runtime.test.mjs
game-libs/map/test/semantics.test.mjs
test/map-layering-browser.test.mjs
apps/desktop/test/renderer-input-source.test.mjs
test/m15-hostra-product.test.mjs               // 端到端能力足够时优先复用
```

允许增加一个专用于 movement latency 的 test helper；不得复制一套生产 input、transport 或 projector 实现来制造假 E2E。

### 8.3 切片 A～C 禁止修改

```text
packages/data/**
packages/subsystem/**
packages/renderer/**
packages/renderer-control/**
```

若 A～C 无法在上述范围达到指标，记录 trace 证据并 STOP，再启动 §7.3 的 ADR。

---

## 9. 测试矩阵

### 9.1 Runtime

- standing keydown 立即开始 `160ms` motion。
- completion 早于/等于/晚于 keyup 的边界。
- held 同方向连续移动无 standing snapshot。
- walking 中 held 转向在下一 boundary 生效。
- walking 中不同方向快速 tap 被消费恰好一次。
- walking 中同方向快速 tap 不产生额外一步。
- 多个 buffered turn 只有最后一个生效。
- collision 清 buffer、pattern 和 timer。
- contact/edge/step transfer 清理旧 buffer，不把 source intent 泄漏到错误地图；既有 held continuation 规则另行保持。
- stale timer、abort 和 late callback 不产生新 motion。

### 9.2 Browser

- `durationMs=160` 合法，区间外值 fail closed。
- Runtime 同一 walking state 的 MapView/MapSprite motion id 和 duration 相等。
- 四 pattern、半步切换、整数像素、终点 snap 保持正确。
- 同 motion id redelivery 不重启时间线。
- 新 motion id 替换旧 motion；standing cancel 仍最终收敛。
- Map066 规模 payload 下，camera rAF 不重复 decode。
- camera-only frame 不重新 rasterize 静态 tile backing。
- autotile index 未变化时不重画相同 backing。
- sprite canvas 尺寸在同一 identity 的 movement frame 间保持不变。
- depth boundary、overscan、stale image、disconnect/reconnect 和 transfer 回归。

### 9.3 End-to-end

- warm keydown-to-first-pixel P50/P95。
- 连走 100 格的 step interval 分布和 dropped visual step 数。
- 横纵快速转向、两键重叠、短 tap。
- 人为注入 20ms、50ms、200ms carrier delay 的降级曲线。
- 首次冷资源加载单独报告，不与 warm input latency 混为一个指标。
- source/dist/FSDB presentation 不一致时 local launcher 明确失败。

时间测试必须使用可控 clock 或事件时间线；禁止仅靠固定长 sleep 后断言最终位置。

---

## 10. 实施细则与提交边界

### 10.1 开始实施前

先确认工作树中现有改动归属，不覆盖未提交的 autotile 文档或实现。以当前主线执行一次 targeted baseline：

```bash
npm test -w @loomrealm-game/map
node --test test/map-layering-browser.test.mjs
npm run test:m15:desktop
```

记录：

```text
commit SHA
Node / Electron / Chromium 版本
机器 CPU/GPU
Map066 snapshot bytes / visible tile count
warm keydown-to-first-pixel P50/P95
120 帧中的 >16.7ms、>33.4ms 帧数
是否观察到完整跳格
```

若当前 baseline 已失败，先区分既有失败与改造失败，不得删除断言或放宽安全校验来获得绿色结果。

### 10.2 PR 1：基线与防陈旧

```text
端到端 trace/test harness
Map066 规模 browser benchmark
local source/dist/FSDB 一致性检查
```

本 PR 不改变移动行为。

local 启动采用“自动增量构建、同步后校验哈希”的默认方案：

```text
play.bat
  → build @loomrealm-game/map
  → 必要时 build @loomrealm/desktop
  → 校验 map source 与 dist 一致
  → 从 dist 把 map.browser.js / map.css 同步到唯一 FSDB Presentation
  → 比较 source、dist、FSDB presentation 哈希
  → 一致才启动 Hostra
```

同步脚本只允许更新：

```text
[resource]Presentation/map/map.browser.js.js
[resource]Presentation/map/map.css.css
```

不得借此重导入或改写用户的其他 FSDB 内容。找不到唯一 `[FSDB]*`、复制失败或哈希不一致时，启动必须失败并输出可执行的修复命令。

建议提交：

```text
test(map): add end-to-end movement latency baseline
build(example): keep map presentation artifacts synchronized
```

### 10.3 PR 2：160ms cadence

先只改步长，不同时重写 renderer。

`game-libs/map/src/runtime.ts`：

```ts
const WALK_STEP_MS = 160;
```

以下事实必须继续来自同一个常量：

```ts
cameraMotion.durationMs = WALK_STEP_MS;
player.motion.durationMs = WALK_STEP_MS;
stepTimer = setTimeout(() => finishStep(moveId), WALK_STEP_MS);
```

`game-libs/map/browser/map.browser.js` 不再把合法值写死为 250：

```js
function validMotionDuration(value) {
  return Number.isSafeInteger(value) && value >= 80 && value <= 1000;
}
```

`validCameraMotion()` 和 `validPlayerMotion()` 都调用该函数。Runtime tests 断言同一 walking state 中 player/camera 的 `id`、`durationMs` 相等；Browser custom element 只校验各自数据，不增加跨组件查询。

测试按精确边界推进 fake clock：

```text
159ms → activeMove 仍存在
160ms → finishStep 恰好生效
```

不得用 170ms/200ms 的宽松 sleep 替代边界测试。

### 10.4 PR 2：一次格边界方向缓冲

与 cadence 同一 PR 落地，但作为独立 commit，便于回归定位。

`ActiveMove` 增加当前格的路径方向：

```ts
interface ActiveMove {
  readonly id: number;
  readonly fromX: number;
  readonly fromY: number;
  readonly direction: Direction;
  readonly startPattern: 1 | 3;
}
```

创建 step 时固定它：

```ts
activeMove = {
  id: moveId,
  fromX,
  fromY,
  direction: next,
  startPattern: nextStartPattern,
};
```

增加：

```ts
interface BufferedTurn {
  readonly direction: Direction;
  readonly observedDuringMoveId: number;
}

let bufferedTurn: BufferedTurn | null = null;
```

非-repeat keydown 的实现顺序固定为：

```ts
heldDirections = heldDirections.filter((item) => item !== movement.direction);
heldDirections.push(movement.direction);

if (activeMove !== null) {
  if (movement.direction !== activeMove.direction) {
    bufferedTurn = {
      direction: movement.direction,
      observedDuringMoveId: activeMove.id,
    };
  }
  return;
}

attempt(movement.direction);
```

`keyboard.state` 只 reconciliation 物理 held 集合，不凭 retained state 合成短 tap buffer；buffer 只来自非-repeat `keyboard.event`。这样重连 baseline 不会制造历史转向。

keyup：

```ts
heldDirections = heldDirections.filter((item) => item !== movement.direction);
```

keyup 不清除已记录的不同方向 buffer，也不得为同方向短按生成额外直行一步。

`finishStep(moveId)` 的顺序固定为：

```text
1. abort / stale move id guard
2. capture completedMove
3. stepTimer = null; activeMove = null
4. 查 completed-step transfer；命中则清 buffer 并 transfer
5. 读取并清除只属于 completedMove.id 的 bufferedTurn
6. 有 buffered turn → toggle stride → attempt(buffered direction)
7. 否则有 held direction → toggle stride → attempt(highest held)
8. 否则 reset stride → standing RenderState
```

建议抽出纯局部 helper，避免每条退出路径漏清理：

```ts
const takeBufferedTurn = (moveId: number): Direction | null => {
  const direction = bufferedTurn?.observedDuringMoveId === moveId
    ? bufferedTurn.direction
    : null;
  bufferedTurn = null;
  return direction;
};
```

collision、`startTransfer()`、transfer failure/commit、abort 和 cleanup 都将 `bufferedTurn = null`。buffer 最多消费一次，不跨 map，不形成队列。

建议提交：

```text
fix(map): reduce walking cadence to 160ms
fix(map): buffer one boundary turn during active movement
```

### 10.5 PR 3：Browser prepare 与 motion timeline

先完成 `MAP_AUTOTILE_ANIMATION_DESIGN_DRAFT.md` 已要求的一次异步 prepare；不得直接从当前 async-every-frame 结构跳到复杂 cache。

目标调用关系：

```text
receiveRenderData(data)
  → retire old epoch / capture latest
  → _prepareLatest(data, epoch)       // 每次 delivery 至多一次 async
  → _paintPrepared(prepared, now)     // 同步
  → requestAnimationFrame
  → _paintPrepared(prepared, now)     // 同步
```

`_paintPrepared()` 禁止 `await`、resource fetch、`Promise.all` 和 `createImageBitmap`。

MapView 与 MapSprite 各自保存当前 motion timeline，例如：

```js
this._motionId = undefined;
this._motionStartedAt = undefined;
```

接收规则：

```js
if (motion === null) {
  this._motionId = undefined;
  this._motionStartedAt = undefined;
} else if (motion.id !== this._motionId) {
  this._motionId = motion.id;
  this._motionStartedAt = performance.now();
}
```

同 motion id 的重复 delivery 沿用原 `_motionStartedAt`，不得重启到 progress 0；新 id 建立新 timeline；standing 立即结束旧 timeline并 snap 到 authority target。

每个组件的一次 paint 只取一次时间：

```js
const now = performance.now();
```

MapView 用该次 `now` 同时计算 camera progress 和 autotile index；MapSprite 用它计算 player progress、pattern、position 和 depth。如果 MapView/MapSprite 暂时仍是两套 rAF，则用测试保证相同 motion id 的首帧和完成时间差不超过一帧，不先引入全局 coordinator。

建议提交：

```text
refactor(map-browser): prepare resources once per render state
fix(map-browser): preserve repeated motion timelines by id
```

### 10.6 PR 3：地图和人物绘制缓存

在同步 `_paintPrepared()` 稳定后增加 cache。

地图层按 depth 保存：

```text
backing canvas
world origin x/y
covered bounds
tile/resource/layout identity
last autotile frame indexes
```

收到新的 tile/resource/layout identity 时重建 backing；camera-only rAF 只更新位置：

```js
layer.canvas.style.transform =
  `translate3d(${originX - cameraX}px, ${originY - cameraY}px, 0)`;
```

具体 canvas 尺寸和 origin 由投影 tile bounds 决定，必须覆盖 source→target camera 全路径及 overscan。禁止仍用固定 `640×480` backing 后直接平移而在边缘露空。

autotile 多帧存在时：

- frame index 未变化：不 clear、不遍历 tiles、不 draw；
- frame index 变化：只重画包含相应 animated slot 的 layer；
- camera position 改变但 autotile frame 未变：只 transform。

人物拆成 raster state 与 placement state：

```text
raster identity = sprite identity + direction + pattern
placement       = interpolated screenX/screenY + visual depth
```

raster identity 不变时只更新 CSS transform/z-index。不得在相邻 movement frame 中重复赋值 `canvas.width/height`。

Map066 性能测试必须同时证明结果和工作量，而不仅是截图相等。对同一个 prepared state 直接驱动 120 次合成采样：

```text
同一 prepared state 的 120 次 camera placement sample
→ resource prepare 1 次
→ static backing rasterize 1 次
→ placement update 多次
→ 无 60Hz full-tile redraw
```

建议提交：

```text
perf(map-browser): cache tile backing layers during camera motion
perf(map-browser): separate sprite raster and placement updates
```

### 10.7 PR 4：有证据时才创建

完成 PR 1～3 后重新记录与 §10.1 相同的指标。只有满足 §7.3 的触发条件，才创建：

```text
Render patch / scene state split ADR
framework qualification
map migration
```

候选 ADR 必须优先设计 retained、可恢复的 scene/motion state；不得用无界 RenderEvent animation command queue。没有测量证据则不创建 PR 4。

---

## 11. Gates

每个行为或 production 改动至少执行：

```bash
npm test -w @loomrealm-game/map
node --test test/map-layering-browser.test.mjs
npm run test:m15:desktop
```

修改 local launcher 或 Hostra E2E 后追加：

```bash
npm run build:m15
npm run test:m15:hostra
```

合并前执行与当前主线约定一致的完整 map/m15 regression。性能 gate 必须保存运行环境、样本数、P50/P95 和失败阈值；单次最快结果不能作为通过证据。

---

## 12. 完成定义

### Implementation Complete

- §2.1 指标在 CI 可用的稳定测试环境或约定 qualification 机器上达标；
- 160ms cadence、buffered turn、collision、transfer 和 keyup 语义都有确定性测试；
- Map066 规模下 camera motion 不再每帧重建静态地图；
- normal local load 下没有 walking snapshot 消失导致的跳格；
- source、dist、FSDB presentation 不会静默版本漂移；
- A～C 没有修改 framework packages，或已经停止并转入独立 ADR。

### Product Closed

真实 `[FSDB]Essentials v21.1` 至少完成：

1. Map066 出生点四方向起步、急转、短 tap、连续行走；
2. Map066 ↔ Map067 门 transfer；
3. Map066 → Map002 后在 camera 跟随区连续移动；
4. 至少一个多帧 autotile 地图上同时观察环境动画、人物和 camera；
5. 窗口失焦/恢复、重新连接和关闭期间没有 ghost input 或 stale motion。

每个场景同时检查碰撞、layering、最终坐标和输入手感。Product Closed 记录实际 P50/P95 和帧时间，不只记录“人工测试通过”。

---

## 13. Freeze 前待确认

Freeze 只剩以下产品选择：

1. 正式步长是否采用本文建议的 `160ms`；若改成其他值，必须同步修改 §2.1 全部指标和测试。
2. 不同方向的短 tap 是否按 §5.3 保证一次转向；若产品不希望 tap buffer，应删除该节及对应验收，不得留成实现者可选项。
3. local launcher 默认采用 §10.2 的“自动增量构建 + 从 dist 同步 + 三方哈希校验”；Freeze 前只需确认是否接受该默认方案。
4. autotile animation draft 与本改造的 Browser paint-loop 由哪个 PR 先落地。

上述四项确认后再将状态改为 `Frozen for implementation`。Freeze 后，实施者不得自行扩大到 framework patch，也不得以 transport 最终收敛为理由接受正常本地链路的可复现跳格。
