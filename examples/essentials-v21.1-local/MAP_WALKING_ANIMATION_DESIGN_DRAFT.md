# 人物行走动画设计草案

> 状态：Draft  
> 目录：`examples/essentials-v21.1-local`  
> 对应需求：`MAP_BEHAVIOR_REQUIREMENTS.md` §2 人物行走动画  
> 目标：在不引入通用动画系统、不修改 LoomRealm framework 合同的前提下，实现 Essentials/RMXP 风格的一格移动、连续步态、平滑 camera，以及移动中的正确 layering。

---

## 1. 范围

本 slice 只解决：

- 一格移动从瞬移变成固定时长的平滑移动；
- 4×4 character sheet 的 4 列 pattern 真正参与绘制；
- 按住方向连续走多格，步态连续；
- 松键后当前一步走完整格，再回站立帧；
- walking 中按下其他方向只改变“下一步意图”，不让当前半格转向；
- 撞墙只改变朝向，不播放 walking cycle；
- camera 与人物同步平滑移动；
- moving 时 character depth 跟视觉脚点变化，不提前整格切换遮挡；
- Render transport 发生延迟/合并时，presentation 必须最终收敛到最新权威状态。

不解决：

- 跑步、自行车、冲浪、跳跃；
- NPC/Event 移动；
- 地图跳转；
- 通用 Tween/Timeline/Animation/GameLoop framework；
- renderer/subsystem/data 合同修改；
- 为了“每一格动画在任意 transport backpressure 下绝不丢失”而增加可靠动画命令通道。

---

## 2. 兼容基线

Essentials v21.1 默认 walking `move_speed = 3`：

```text
一格移动时间 = 0.25 s = 250 ms
```

本 slice 使用：

```ts
const WALK_STEP_MS = 250;
```

Essentials 的关键模型：

```text
x/y
= 已决定的逻辑目标格

real_x/real_y
= 从源格向目标格插值的视觉位置
```

LoomRealm 对应为：

```text
Runtime x/y
= 权威逻辑格坐标

ActiveMove
= 当前正在完成的一步

Browser
= ActiveMove 的逐帧视觉投影
```

禁止把 Runtime `x/y` 改成浮点数。

### Pattern

character sheet 每个方向有 4 列：

```text
0, 1, 2, 3
```

静止：

```text
pattern = 0
```

walking 250ms/格，每格显示两个相邻 pattern：

```text
step 1: 1 → 2
step 2: 3 → 0
step 3: 1 → 2
step 4: 3 → 0
```

真正停止或 collision 后重置 phase；下一次重新起步从 `1 → 2` 开始。

---

## 3. Authority 边界

### Runtime 负责

`@loomrealm-game/map` Runtime 负责：

- 权威格坐标 `x/y`；
- 当前完成中的 `direction`；
- passability；
- held direction 顺序；
- 是否开始一步；
- 一步何时逻辑完成；
- 下一步使用哪个 held direction；
- stop / collision 后的 standing 状态。

### Browser 负责

`game-libs/map/browser/map.browser.js` 负责：

- `requestAnimationFrame()`；
- visual progress；
- sprite screen position interpolation；
- camera interpolation；
- 半步 pattern 切换；
- visual foot depth；
- Canvas 重绘；
- 新 RenderData 到来时让旧 presentation animation 失效。

### 明确禁止

Runtime 不以 60Hz 连续 `domain.replace()`。

Browser 不决定：

- 能否走；
- 下一格逻辑坐标；
- 是否继续下一格；
- input precedence。

---

## 4. Render transport 合同

这是本设计的关键边界。

`RenderDomain.replace()` 表达的是 **latest authoritative render state**，不是不可丢失的 animation command。Subsystem RenderManager 允许尚未发送的同-domain snapshot 被更新状态合并。

因此本 slice 冻结以下语义：

### 正常链路

transport 没有明显 backpressure 时：

```text
step start RenderState
  ↓
Browser 收到 motion
  ↓
约 250ms visual walking
  ↓
next-step / standing RenderState
```

目标是完整呈现每格 walking animation。

### 降级链路

如果 transport 延迟或合并中间 snapshot：

- 允许跳过一个或多个中间视觉 transition；
- Browser 不得继续运行已过期 rAF；
- Browser 不得长期停留在旧位置、旧 camera 或旧 z-index；
- 收到较新的 walking state 时，直接切到该 state 描述的 source boundary，再动画到它的 target；
- 收到 standing state 时，立即取消旧动画并 snap 到最新 target；
- 最终 presentation 必须收敛到最新 `x/y/camera/direction/pattern`。

也就是说：

```text
完整动画 = 正常 presentation quality
最终收敛 = correctness requirement
```

如果产品要求“即使 Render transport 任意拥塞，每一个逻辑 step 的动画也绝不能丢”，则 **STOP**：这超出 map-local slice，需要重新开放 framework/presentation delivery contract，不得在 map library 内偷偷实现队列或 ACK 协议。

不使用 `RenderEvent` 绕过该边界；当前 presentation facts 不把 Render events 作为 custom-element animation command 通道。

---

## 5. Runtime 最小状态

保持：

```ts
let x = input.x;
let y = input.y;
let direction: Direction = 2;
```

新增：

```ts
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

不保存重复事实：

```text
toX/toY      // 当前 x/y 已经是目标格
dx/dy        // 只在尝试开始一步时需要
durationMs   // 固定 WALK_STEP_MS
```

不引入 `CharacterController`、`AnimationManager`、`Timeline`、`Clock` 等新层。

---

## 6. Held input 与唯一优先级

Runtime listener 订阅：

```text
keyboard.event
keyboard.state
```

不使用 OS keyboard repeat 作为游戏步频。

### 6.1 非 repeat keydown

对方向键：

```text
1. 从 heldDirections 删除该 direction（如果已存在）
2. 将该 direction push 到数组末尾
3. 数组末尾 = 当前最高优先 held direction
```

如果 `activeMove !== null`：

- 只更新 held 顺序；
- 不改变当前 `direction`；
- 不重新 `canMove`；
- 不发送 RenderState。

因此人物不会在半格中途转身。

如果 `activeMove === null`：

- 立即尝试数组末尾方向。

### 6.2 keyup

对方向键：

```text
立即从 heldDirections 删除该 direction
```

不能只等待后续 `keyboard.state`，避免 keyup 已发生但 step completion 恰好先于 state reconciliation 时多走一格。

如果此时 `activeMove === null` 且仍有其他 held direction：

- 立即尝试新的数组末尾方向。

### 6.3 keyboard.state reconciliation

`keyboard.state.down` 是 held membership 的权威校正：

1. 删除不在 `down` 中的方向；
2. 对 `down` 中存在、但 `heldDirections` 缺失的方向，按固定 fallback 顺序补入：

```text
ArrowUp → ArrowDown → ArrowLeft → ArrowRight
```

后补方向依次 push，因此在完全没有 event history 的 retained-state baseline 场景中，结果仍确定。

正常交互的 precedence 仍由 keydown event 顺序决定；固定 fallback 只用于恢复/基线缺失 event history 的情况。

reconciliation 后如果 `activeMove === null` 且存在 held direction：

- 尝试数组末尾方向。

### 6.4 多方向精确例子

```text
keydown Up        => [Up]          => Up
keydown Right     => [Up, Right]   => Right
walking 中 keyup Right
                  => [Up]          => 当前格继续原方向，下一格 Up
keydown Left      => [Up, Left]    => 当前格继续原方向，下一格 Left
keyup Left        => [Up]          => 下一格 Up
```

---

## 7. 一步状态机

### 7.1 Standing

```text
activeMove = null
pattern = 0
```

尝试最高优先 held direction：

1. 取 movement；
2. 设置 `direction = movement.direction`；
3. `canMove(...)`；
4. 不可走：进入 Collision；
5. 可走：进入 Walking start。

### 7.2 Walking start

成功开始一步：

```ts
const fromX = x;
const fromY = y;

x += movement.dx;
y += movement.dy;

activeMove = {
  id: nextMoveId++,
  fromX,
  fromY,
  startPattern: nextStartPattern,
};
```

`x/y` 在 step start 立即成为目标格。

随后：

```text
1. domain.replace(renderState())
2. stepTimer = setTimeout(() => finishStep(moveId), WALK_STEP_MS)
```

每一步 Runtime 只生成一次 walking RenderState。

### 7.3 Walking 中输入

`activeMove !== null` 时：

- keydown/keyup/state 只维护 held intent；
- 当前 `direction` 不变；
- 当前 `x/y` 不变；
- 当前 `activeMove` 不变；
- 不追加第二个 step timer；
- 不发新的 movement RenderState。

新方向只在当前格 completion boundary 生效。

### 7.4 Walking complete

callback 先检查：

```text
frame.signal.aborted === false
activeMove?.id === moveId
```

无效则直接 return。

有效时先：

```ts
stepTimer = null;
activeMove = null;
```

然后：

- 有 held direction：切换 `nextStartPattern` 的 `1 ↔ 3`，尝试数组末尾方向；
- 无 held direction：`nextStartPattern = 1`，发送 standing RenderState。

连续成功 step 之间不得插入 standing RenderState。

### 7.5 松键

松键不取消已经开始的一步。

当前格一定走到目标格中心，再根据 held state 决定下一步或停止。

禁止半格 authority。

### 7.6 Collision

不可通行时：

```text
direction = attempted direction
x/y 不变
activeMove = null
stepTimer = null
nextStartPattern = 1
pattern = 0
```

发送一次 standing RenderState，使朝向更新可见。

如果最高优先方向 blocked，不在同一次 attempt 中自动尝试次高方向；释放/改变 held precedence 后再尝试。

不得为了撞墙启动 walking cycle。

---

## 8. 精确 camera / screen 投影

step start 时：

```ts
const fromCamera = computeCamera(map, activeMove.fromX, activeMove.fromY);
const targetCamera = computeCamera(map, x, y);
```

目标 Map state：

```text
cameraX = targetCamera.cameraX
cameraY = targetCamera.cameraY
```

Player source/target screen position 必须按各自对应 camera 计算：

```ts
fromScreenX = activeMove.fromX * 32 - fromCamera.cameraX;
fromScreenY = activeMove.fromY * 32 - fromCamera.cameraY;

screenX = x * 32 - targetCamera.cameraX;
screenY = y * 32 - targetCamera.cameraY;
```

禁止使用 target camera 去计算 `fromScreen*`。

standing 时：

```text
camera = computeCamera(map, x, y)
screen = x/y * 32 - camera
```

---

## 9. Player RenderData

Runtime 不发送逐帧 `progress`。

目标 shape：

```ts
{
  x,
  y,
  screenX,
  screenY,
  direction,
  pattern,
  sprite,

  motion: activeMove
    ? {
        id: activeMove.id,
        durationMs: WALK_STEP_MS,
        fromY: activeMove.fromY,
        fromScreenX,
        fromScreenY,
      }
    : null,
}
```

含义：

- `x/y`：目标逻辑格；
- `screenX/screenY`：目标 screen position；
- `motion.fromScreen*`：一步 source screen position；
- `motion.fromY`：moving depth 的 source world Y；
- `pattern`：walking 时为 `activeMove.startPattern`，standing 时为 `0`；
- `motion === null`：standing。

不要增加：

```text
progress
elapsedMs
currentVisualX/Y
fromX
```

到 Player RenderData。

### Browser validation

Player 至少验证：

```text
x/y                 non-negative safe integer
direction           one of 2/4/6/8
pattern             one of 0/1/2/3
screenX/screenY     finite number
motion              null or exact object
motion.id           positive safe integer
motion.durationMs   exactly 250
motion.fromY        non-negative safe integer
motion.fromScreenX/Y finite number
```

保持 `screenX/screenY` 为有限数值，不新增“必须整数”限制。

---

## 10. `lr-map-sprite`

### Pattern source rect

```js
sx = pattern * frameWidth;
```

方向行继续沿用当前逻辑。

### Walking rAF

`motion !== null`：

```text
receive RenderData
  ↓
cancel prior rAF
  ↓
startedAt = performance.now()
  ↓
rAF
  ↓
progress = clamp((now - startedAt) / 250, 0, 1)
  ↓
position = lerp(fromScreen, targetScreen, progress)
```

Pattern：

```text
progress < 0.5
→ startPattern

progress >= 0.5
→ (startPattern + 1) % 4
```

新 RenderData 必须通过 current-data / motion-id guard 使旧 callback 无效。

### progress = 1

到达 1 后：

- 精确放到 target screen position；
- 保持该 step 第二半 pattern；
- 停止继续 requestAnimationFrame；
- 等待 Runtime 的 next-step 或 standing RenderState。

Browser 不自行决定逻辑 step complete，也不自行切 standing 0。

### standing

`motion === null`：

- 取消旧 rAF；
- 绘制 `pattern = 0`；
- snap 到最新 target screen position；
- 按最新 `y` 设置 standing depth。

这也是 transport coalescing 后的最终 convergence path。

---

## 11. Moving layering

standing character depth 保持当前整数 `y` 规则。

moving 时按视觉脚点像素：

```js
const visualPixelY = Math.round(
  lerp(motion.fromY * 32, data.y * 32, progress),
);

const visualFootDepth =
  visualPixelY
  + 32
  + (frameHeight > 32 ? 31 : 0);

this.style.zIndex = String(
  characterStackValue(visualFootDepth),
);
```

这里固定使用 `Math.round`，对应角色视觉 ground position 的整像素行为。

已完成 layering 的 tie rule 保持不变：

```text
characterDepth < tileDepth  => tile above character
characterDepth = tileDepth  => character above tile
characterDepth > tileDepth  => character above tile
```

因此 crossing boundary 是 visualFootDepth 第一次达到 tileDepth 的那个整像素。

Browser test 必须验证 boundary 前一个像素与 boundary 当像素的最终 compositor 结果。

---

## 12. Camera motion

Map RenderData：

```ts
{
  cameraX,
  cameraY,
  ...,

  cameraMotion: activeMove
    ? {
        id: activeMove.id,
        durationMs: WALK_STEP_MS,
        fromCameraX: fromCamera.cameraX,
        fromCameraY: fromCamera.cameraY,
      }
    : null,
}
```

`cameraX/cameraY` 表示 target camera。

Map view validation 至少要求：

```text
cameraX/cameraY               finite non-negative number
cameraMotion                  null or exact object
cameraMotion.id               positive safe integer
cameraMotion.durationMs       exactly 250
cameraMotion.fromCameraX/Y    finite non-negative number
```

`lr-map-view` 独立执行：

```text
startedAt = performance.now()
visualCamera = lerp(fromCamera, targetCamera, progress)
```

按 visual camera 重画已有 Canvas buckets。

`progress = 1` 后：

- 精确保持 target camera；
- 停止继续 rAF；
- 等待下一份 RenderData。

standing state 到来时取消旧 rAF 并 snap 到 target camera。

### 不共享 Browser animation clock

`lr-map-sprite` 与 `lr-map-view` 各自使用本 element 收到 RenderData 时的 `performance.now()`。

不引入：

```text
MotionClock
SharedTimeline
AnimationEpochRegistry
module-global motion timestamp registry
```

正常链路允许 presentation 层存在至多约一帧的启动偏差；browser test 负责证明没有可见的 32px camera/player 脱节。

---

## 13. Tile overscan

camera 一步最多移动 32px，因此 tile projection 固定增加一格 overscan：

```text
left   -1 tile
right  +1 tile
top    -1 tile
bottom +1 tile
```

受 map bounds clamp。

`projectVisibleTiles()` 内部固定 `overscan = 1`，不新增 public/configurable 参数。

projection 仍围绕 **target camera** 计算；一格 overscan 必须覆盖 source camera 到 target camera 的完整 32px 插值范围。

standing 与 moving 都统一投影 overscan。

---

## 14. Timer 与 lifecycle

### Runtime

第一刀直接使用局部 timer：

```ts
stepTimer = setTimeout(
  () => finishStep(moveId),
  WALK_STEP_MS,
);
```

不引入 Clock/Scheduler/TimerService。

frame abort：

```text
close input listener
clearTimeout(stepTimer) if present
stepTimer = null
activeMove = null
close RenderDomain
```

completion callback 必须再次检查：

```text
frame not aborted
activeMove?.id === moveId
```

### Browser

Browser frame rate 只影响绘制平滑度，不影响逻辑步速。

rAF 使用 elapsed time；掉帧后直接追到正确 progress，不累计固定像素步长。

custom element disconnect、新 motion、standing state 都必须让旧 rAF 失效。

不得让 stale callback 在 element disconnect 后继续 paint。

---

## 15. 修改面

Production 只预计涉及：

```text
game-libs/map/src/runtime.ts
game-libs/map/src/semantics.ts
game-libs/map/browser/map.browser.js
```

Tests：

```text
game-libs/map/test/semantics.test.mjs
game-libs/map/test/runtime.test.mjs      // 新增
root Chromium browser test               // 新增或扩展
```

`runtime.test.mjs` 应通过导出的 map subsystem definition + 最小 fake scope/content/input/render harness 验证 Runtime 行为。

不要为了方便测试把 movement state machine 抽成新的 production `MovementController` / `MovementMachine`。

除非发现当前合同无法表达的 blocker，否则禁止修改：

```text
packages/renderer/**
packages/subsystem/**
packages/data/**
tools/**
```

---

## 16. 自动化测试闭环

### 16.1 Semantics

至少覆盖：

1. overscan 在 map 四边正确 clamp；
2. target camera + overscan 能覆盖相邻 source camera 的完整一步插值范围；
3. 现有 passability / layering tests 保持通过。

### 16.2 Runtime

至少覆盖：

1. 成功移动在 step start 只更新一次目标格；
2. walking RenderData 的 source/target camera 与 screen 公式精确；
3. collision 不创建 `ActiveMove`，并重置 `nextStartPattern = 1`；
4. 松键不取消当前一步；
5. keyup 在 state reconciliation 前发生时不会多走一格；
6. walking 中按新方向只更新 held intent，当前 direction/motion 不改变；
7. completion 后才切到新方向；
8. 连续 4 格 `startPattern = 1, 3, 1, 3`；
9. 真正 stop 后回 pattern 0；
10. stale move id completion 无作用；
11. frame abort 后无晚到 replace；
12. held precedence 精确向量：

```text
Down(press)              => Down
Right(press)             => Right
Right(release)           => Down
Left(press)              => Left
Left(release)            => Down
Down(release)            => none
```

13. retained keyboard.state 没有 event history 时，fallback 顺序结果确定；
14. 每个 walking player motion id 与 cameraMotion id 相同。

### 16.3 Browser

至少覆盖：

1. pattern 0/1/2/3 source rect 正确；
2. 一格开始时不瞬移到 target；
3. 约 50% progress 位于 source/target 中间；
4. progress=1 精确落 target 且停止 rAF；
5. 半步切 pattern；
6. standing 绘制 pattern 0；
7. 新 motion 使旧 rAF 失效；
8. element disconnect 后旧 rAF 不再 paint；
9. camera 与人物同步插值，无 32px 瞬跳；
10. moving z-index 随 visual Y 变化；
11. boundary 前一个像素 tile 在前，boundary 当像素 character 在前；
12. Chromium 最终像素证明真实 compositor layering；
13. coalescing/convergence：直接跳过一个 walking state 后投递更新 state，旧 motion 不继续覆盖；
14. 直接从 stale walking state 投递 standing latest state，sprite/camera 立即收敛到 standing target。

Browser race tests 禁止用固定 sleep 作为 stale completion 证明；等待明确 rAF/state condition。

---

## 17. 玩家可见验收

真实 Essentials 示例中按住一个方向至少走 4 格，必须看到：

- 连续位移；
- 左右脚交替；
- 每格之间无 standing 闪帧；
- 松键后走完当前格再停；
- walking 中按另一方向，只在格子中心转向；
- 停下后回 standing；
- 撞墙不原地踏步；
- camera 跟随平滑；
- 穿过树冠/屋檐边界时遮挡没有提前或滞后一整格。

产品级 material parity 仍需记录精确 fixture：

```text
mapId
起点坐标
移动方向/步数
tileId / tile priority
character frameHeight
预期遮挡切换点
```

implementation agent 不负责自行寻找真实素材场景。

---

## 18. 抽象预算

本 slice 明确禁止新增：

```text
AnimationManager
Timeline
Tween service
GameLoop framework
CharacterController hierarchy
MovementController
MovementMachine
SceneGraph
Clock abstraction
MotionClock
SharedTimeline
Render ACK/animation queue protocol
```

允许的新长期状态仅限：

```text
Runtime:
  heldDirections
  activeMove
  nextMoveId
  nextStartPattern
  stepTimer

lr-map-sprite:
  current rAF handle / current data or motion id

lr-map-view:
  current rAF handle / current data or motion id
```

优先保持代码局部、显式、可测试。

---

## 19. 冻结前剩余事项

在把本文改为 `Frozen for implementation` 前，只剩以下事项需要补成仓库级精确执行合同：

1. browser test 的确切 root 文件名、fixture 组织方式与执行命令；
2. `runtime.test.mjs` 的最小 fake scope harness 具体结构和执行命令；
3. 真实 Essentials v21.1 material parity fixture（仅用于 Product Closed，不阻塞纯 implementation spec 时需明确区分）。

已经关闭、不再交给实施者选择：

- authority 与逻辑/视觉坐标边界；
- 250ms walking cadence；
- walking 中输入不改变当前 step；
- keydown/keyup/state 的 held precedence；
- collision phase reset；
- Runtime timer：局部 `setTimeout` + abort `clearTimeout`；
- Render transport：latest-state projection，可降级丢中间 transition，但必须最终收敛；
- Browser：两个 custom element 独立 rAF，不共享 animation clock；
- progress=1 后停止 rAF并等待权威 next state；
- moving depth：pixel lerp + `Math.round`；
- camera/source/target screen 公式；
- tile overscan：固定 1 tile，不参数化；
- `ActiveMove`：只保存 `id/fromX/fromY/startPattern`；
- Player motion：只传 `id/durationMs/fromY/fromScreenX/fromScreenY`；
- 不修改 framework contract。

---

## 20. 目标闭环

```text
keyboard event/state
        ↓
Runtime held order
        ↓
activeMove ?
   ┌────┴────┐
  yes        no
   │          │
只更新下一步  选择最高优先方向
意图          ↓
             canMove
        ┌────┴────┐
      blocked    passable
        │           │
 standing 0      ActiveMove
 phase reset     x/y → target
                    │
                    │ one latest-state RenderState
                    ▼
          Browser transition data
             ┌────┴────┐
             │         │
         sprite rAF   map rAF
             │         │
      position/pattern camera
      visual depth     tile redraw
             └────┬────┘
                  │
                250ms
                  │
                  ▼
         Runtime completion
             ┌────┴────┐
           held      released
             │           │
         next step    standing 0
```

transport backpressure 时允许中间 presentation transition 被跳过：

```text
old visual state
      ↓
latest RenderState
      ↓
cancel stale rAF
      ↓
latest walking transition / standing snap
      ↓
converged presentation
```

本 slice 完成时必须同时闭合：

- authority；
- input cadence；
- walking 中转向边界；
- 一格移动；
- pattern；
- camera；
- layering；
- transport degradation；
- lifecycle；
- semantics/runtime/browser 自动化测试；
- 真实素材可见验收边界。