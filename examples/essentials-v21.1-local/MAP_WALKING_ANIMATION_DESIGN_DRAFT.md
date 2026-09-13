# 人物行走动画设计

> 状态：Frozen for implementation  
> 对应需求：`MAP_BEHAVIOR_REQUIREMENTS.md` §2  
> 实施规则：本文是唯一实施合同。若任一冻结规则无法满足，**STOP 并报告 blocker**；不得自行换算法、扩大 production 范围或修改 framework contract。

## 1. 范围

只实现：250ms/格 walking、4 列 pattern、held 连续移动、松键走完整格、格中心转向、collision standing、平滑 camera、moving layering、transport coalescing 后最终收敛。

不实现：跑步/自行车/冲浪/跳跃、NPC/Event、map transfer、通用 Animation/Tween/GameLoop、可靠 animation command queue。

固定：

```ts
const WALK_STEP_MS = 250;
```

步态：

```text
standing: 0
step1: 1→2
step2: 3→0
step3: 1→2
step4: 3→0
stop/collision 后下一次重新从 1→2
```

Runtime `x/y` 始终为整数权威目标格；Browser 只做视觉插值。

## 2. 文件边界

Production **只允许**改：

```text
game-libs/map/src/runtime.ts
game-libs/map/src/semantics.ts
game-libs/map/browser/map.browser.js
```

Tests：

```text
game-libs/map/test/semantics.test.mjs
game-libs/map/test/runtime.test.mjs      // 新增
test/map-layering-browser.test.mjs       // 扩展现有 harness
```

禁止修改 `packages/renderer/**`、`packages/subsystem/**`、`packages/data/**`、`tools/**`，禁止新增 production movement/animation 文件。无法在上述范围表达则 STOP。

## 3. Render transport 合同

`RenderDomain.replace()` 是 latest-state projection，不是不可丢 animation command；同-domain 未发送 snapshot 可被合并。

正常链路完整播放约 250ms。发生 backpressure/coalescing 时允许跳过中间 transition，但必须：

- stale rAF/async completion 不覆盖新状态；
- newer walking state 替代旧 motion；
- standing latest state 立即 cancel motion 并 snap target；
- 最终收敛到最新 `x/y/camera/direction/pattern`。

若要求“任意 transport 拥塞下每一步动画绝不能丢”，STOP；不得在 map 内加 ACK/queue，也不得用 `RenderEvent` 绕合同。

## 4. Runtime 状态

```ts
let x = input.x;
let y = input.y;
let direction: Direction = 2;

interface ActiveMove {
  readonly id: number;
  readonly fromX: number;
  readonly fromY: number;
  readonly startPattern: 1 | 3;
}

let activeMove: ActiveMove | null = null;
let nextMoveId = 1;
let nextStartPattern: 1 | 3 = 1;
let heldDirections: Direction[] = [];
let stepTimer: ReturnType<typeof setTimeout> | null = null;
```

不保存 `toX/toY/dx/dy/durationMs`。禁止 `MovementController/MovementMachine/AnimationManager/Timeline/Clock`。

## 5. Input 唯一规则

listener channels：

```text
keyboard.event
keyboard.state
```

OS repeat 不驱动步频。

非-repeat keydown：删除已存在 direction，再 push 到 `heldDirections` 尾部；尾部优先。若 walking，只更新 intent；若 standing，立即 attempt 尾部方向。repeat keydown 忽略。

keyup：立即删除 direction；不能等 state。若 standing 且仍有 held direction，立即 attempt 新尾部方向。

`keyboard.state.down` reconciliation：删除已不 held 的方向；缺失方向按固定 fallback 顺序补入：

```text
ArrowUp → ArrowDown → ArrowLeft → ArrowRight
```

正常 precedence 仍由 keydown 顺序决定。reconciliation 后若 standing 且有 held direction，attempt 尾部方向。

精确向量：

```text
Down press   => [Down]        => Down
Right press  => [Down,Right]  => Right
Right up     => [Down]        => Down
Left press   => [Down,Left]   => Left
Left up      => [Down]        => Down
Down up      => []            => none
```

walking 中任何 input 都不得改变当前 `direction/x/y/activeMove`、不得新增 timer、不得发 movement RenderState；新方向只在 completion boundary 生效。

## 6. Step 状态机

Standing attempt：先 `direction = movement.direction`，再 `canMove`。

Passable：

```ts
const fromX = x;
const fromY = y;
x += movement.dx;
y += movement.dy;
const moveId = nextMoveId++;
activeMove = { id: moveId, fromX, fromY, startPattern: nextStartPattern };
domain.replace(renderState());
stepTimer = setTimeout(() => finishStep(moveId), WALK_STEP_MS);
```

`x/y` 在 step start 立即成为 target。每步只发一次 walking RenderState。

Completion callback 先检查：

```text
frame.signal.aborted === false
activeMove?.id === moveId
```

有效时 `stepTimer=null; activeMove=null`。有 held direction：`nextStartPattern` 在 `1↔3` 切换后立即 attempt；无 held：`nextStartPattern=1` 并发 standing RenderState。连续成功 step 中间不得插 standing。

Collision：

```text
direction = attempted direction
x/y unchanged
activeMove = null
stepTimer = null
nextStartPattern = 1
pattern = 0
```

发一次 standing RenderState。blocked 时不自动尝试次高 held direction。

## 7. Camera / screen 公式

Moving：

```ts
const fromCamera = computeCamera(map, activeMove.fromX, activeMove.fromY);
const targetCamera = computeCamera(map, x, y);

const fromScreenX = activeMove.fromX * 32 - fromCamera.cameraX;
const fromScreenY = activeMove.fromY * 32 - fromCamera.cameraY;
const screenX = x * 32 - targetCamera.cameraX;
const screenY = y * 32 - targetCamera.cameraY;
```

禁止用 target camera 算 `fromScreen*`。

Standing：`camera=computeCamera(map,x,y)`；`screen=x/y*32-camera`。

## 8. RenderData shape

Player：

```ts
{
  x, y, screenX, screenY, direction,
  pattern: activeMove ? activeMove.startPattern : 0,
  sprite,
  motion: activeMove ? {
    id: activeMove.id,
    durationMs: 250,
    fromY: activeMove.fromY,
    fromScreenX,
    fromScreenY,
  } : null,
}
```

禁止增加 `progress/elapsedMs/currentVisualX/Y/fromX`。

Player validation：`x/y` 非负 safe integer；direction 为 2/4/6/8；pattern 为 0..3；screenX/Y finite；motion 为 null 或 exact object；id positive safe integer；durationMs exactly 250；fromY 非负 safe integer；fromScreenX/Y finite。`motion===null => pattern===0`；`motion!==null => pattern===1||3`。screenX/Y 不要求 integer。

MapView 新增：

```ts
cameraMotion: activeMove ? {
  id: activeMove.id,
  durationMs: 250,
  fromCameraX: fromCamera.cameraX,
  fromCameraY: fromCamera.cameraY,
} : null
```

`cameraX/Y`、`fromCameraX/Y` 为非负 safe integer；id positive safe integer；duration exactly 250。Player motion id 必须等于 cameraMotion id。

## 9. Browser animation 唯一算法

两个 element 都使用 **RenderData receipt time**；image decode 不得额外延长 250ms。

`receiveRenderData(data)` 顺序：

```text
validate
cancel prior rAF + clear handle
this._latestData = data
receivedAt = performance.now()
void paintLatest(data, receivedAt)
```

`paintLatest(requested, receivedAt)` 的 `_image()` await 后，无论 success/failure，先判断：

```text
this._latestData === requested
```

不 current 则 no-op。不得仅用 resource identity 代替 current-data identity。

成功拿到 image 后：

```js
progress = clamp((performance.now() - receivedAt) / 250, 0, 1)
```

若 decode 已耗 80ms，第一次可见 paint 从约 0.32 开始；禁止重新从 0 计时。若第一次 paint 已 `progress>=1`，直接 target/第二半 pattern，不启动 rAF。

每个 rAF callback 再检查 `_latestData === requested`。`progress=1` 后精确 target、清空 rAF handle并等待权威 next state；Browser 不自行宣布 step complete 或 standing。

Standing latest state：cancel old rAF，pattern 0，snap target screen/camera，standing depth 用最新整数 y。

`disconnectedCallback()` 必须 cancel rAF；disconnect 后 stale callback 不得 paint。

保持既有 resource failure policy，不新增通用 recovery abstraction。

## 10. Integer pixel 与 layering

逐帧先 lerp 再 round：

```js
visualScreenX = Math.round(lerp(fromScreenX, screenX, progress));
visualScreenY = Math.round(lerp(fromScreenY, screenY, progress));
visualCameraX = Math.round(lerp(fromCameraX, cameraX, progress));
visualCameraY = Math.round(lerp(fromCameraY, cameraY, progress));
```

Canvas tile destination 使用 rounded camera；sprite 使用 rounded screen position，现有 frame centering 保留。

Moving depth：

```js
const visualPixelY = Math.round(lerp(motion.fromY * 32, data.y * 32, progress));
const depth = visualPixelY + 32 + (frameHeight > 32 ? 31 : 0);
this.style.zIndex = String(characterStackValue(depth));
```

Tie rule 不变：tileDepth < characterDepth → tile below；tileDepth > characterDepth → tile above；相等 → character above。boundary 是 visual depth 第一次达到 tileDepth 的整数像素。

Pattern source X：`sx = pattern * frameWidth`；`progress<0.5` 用 startPattern，否则 `(startPattern+1)%4`。

## 11. Camera 与 overscan

sprite/map 两个 element 独立使用各自 `receivedAt`，不共享 clock；允许正常 presentation 最多约一帧启动偏差。

`projectVisibleTiles()` public signature 不变，函数内部固定 `overscan=1 tile`，四边 clamp。projection 围绕 target camera；1 tile 必须覆盖 source→target 的完整一步 camera 插值。standing/moving 都使用 overscan。

## 12. Activation/lifecycle 顺序

content/resource load + validation 后固定 wiring：

```text
1 createRenderDomain(initial standing state)
2 createInputListener(channels: keyboard.event + keyboard.state)
3 register keyboard.event handler
4 register keyboard.state handler
5 await frame abort
```

必须先有 RenderDomain 再注册 handlers；`keyboard.state` retained baseline 可在 `on()` 时同步投递。

Abort：close listener；clear step timer；`stepTimer=null`；`activeMove=null`；close domain。晚到 callback 仍检查 abort + move id。

## 13. Tests：文件与 harness 已冻结

### `semantics.test.mjs`

增加 overscan bounds、target camera overscan 覆盖 source camera、现有 passability/layering regression。把现有 `one long-lived Frame...` Runtime integration 测试移到 `runtime.test.mjs`。

### 新增 `runtime.test.mjs`

用 `node:test`，import package root `mapDefinition`。复制 `semantics.test.mjs` 现有 `table()`/`fixture()` 作为 test-local fixture，不新增共享 module。

Fake scope 固定：`content.record` 返回 inline `struct.Map/1`/`struct.Tileset/1`；`content.resource` 返回 `{bytes:new Uint8Array([1]), mime:"image/png", contentVersion:"v-image"}`；fake RenderDomain 将 initial/replace 的 `structuredClone` push 到 `states[]`；fake listener 用 `Map<channel,handler>` 保存 handler，并可在注册 `keyboard.state` 时同步投递 retained baseline。

Harness 暴露：`emitEvent`、`emitState`、`states`、`latestState()`、`abort()`。

Timer 测试不得改 production Clock。test-local 临时替换 `globalThis.setTimeout/clearTimeout`，记录 callback 与 250ms delay并返回递增 id；`fireNextTimer()` 显式执行；`t.after()` 恢复 globals；这些 tests 不启用并发。禁止用 250/300ms 固定 sleep。

至少覆盖：step start、camera/screen公式、collision phase reset、keyup 不取消当前步、keyup/state race 不多走、walking 中方向只改 intent、completion 后转向、4 格 pattern=1/3/1/3、stop=0、stale callback、abort、§5 precedence、retained baseline fallback、Player/Map motion id 相同、同步 state baseline 在 domain 已存在时可安全启动。

### 扩展 `test/map-layering-browser.test.mjs`

必须复用现有 Playwright Chromium + HTTP server + `openPage()` + OffscreenCanvas PNG + `waitUntil()` + screenshot pixel sampling + delayed resource promise；不新增 browser framework/dependency。

character fixture 改为 4 pattern 列可区分，但第 0 列继续满足现有 layering test 期望。

至少覆盖：4 source rect；中间整数 pixel 位移；半步换 pattern；progress=1 target+rAF stop；standing=0；integer camera/sprite position；moving depth boundary 前/当像素 compositor；new motion cancel old；disconnect cancel；stale image success/failure no-op；decode 延迟按 receivedAt 追赶且 >250ms 直接 target；newer walking 替代旧 walking；standing latest state 收敛。

race/stale 测试禁止固定 sleep，必须等待明确 resource/rAF/DOM/Canvas condition。

## 14. Implementation gate

按顺序执行：

```bash
npm test -w @loomrealm-game/map
node --test test/map-layering-browser.test.mjs
npm run test:m14
```

三条全绿且 production diff 只在 §2 的 3 个文件，才算 **Implementation Complete**。不得修改 closed M14/M15 qualification contract 来让测试通过；冲突则 STOP。

## 15. Product Closed（不阻塞 Implementation Freeze）

真实 Essentials material parity 不由 implementation agent 自行找场景。后续人工记录固定 fixture：`mapId`、起点、方向/步数、tileId/priority、frameHeight、预期遮挡切换点。

真实验收：连续 ≥4 格、左右脚交替、无每格 standing 闪帧、松键走完整格、格中心转向、collision 不踏步、camera 平滑、树冠/屋檐遮挡边界正确。

真实 evidence 若与本文矛盾，STOP 并回设计，不由实施 agent 擅自调规则。

## 16. 抽象预算与实施顺序

禁止：`AnimationManager`、`Timeline`、Tween、GameLoop、CharacterController、MovementController/Machine、SceneGraph、Clock/Scheduler/TimerService、MotionClock、SharedTimeline、AnimationEpochRegistry、Render ACK/queue。

允许新增长期状态仅：Runtime 的 `heldDirections/activeMove/nextMoveId/nextStartPattern/stepTimer`；两个 browser element 各自 rAF handle；复用已有 `_latestData`。`receivedAt` 只存在于单次 receive/paint closure。

实施顺序固定：

```text
1 semantics.ts: overscan=1
2 runtime.ts: held + ActiveMove + timer + RenderData + wiring/lifecycle
3 map.browser.js: validation + pattern + receivedAt/current-data guard + rAF + rounding + depth + disconnect
4 semantics.test.mjs
5 runtime.test.mjs
6 test/map-layering-browser.test.mjs
7 跑 §14 三条命令
```

禁止顺手清理无关 validation、重命名 map API、重构 framework 或实现 transfer。

---

本文已冻结：authority、250ms cadence、held precedence、walking 转向边界、collision phase、timer、transport degradation、RenderData shape、camera/screen 公式、async image/rAF 起点、stale guard、integer pixel rounding、depth boundary、overscan、activation/lifecycle、production/test 文件、test harness、执行命令，以及 Implementation Complete / Product Closed 边界。**实施 agent 不应再做设计选择。**