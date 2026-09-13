# 人物行走动画设计草案

> 状态：Draft  
> 目录：`examples/essentials-v21.1-local`  
> 对应需求：`MAP_BEHAVIOR_REQUIREMENTS.md` §2 人物行走动画  
> 目标：在不引入通用动画系统、不修改 LoomRealm framework 合同的前提下，实现 Essentials/RMXP 风格的一格移动、连续步态、平滑 camera 与移动中的正确 layering。

---

## 1. 范围

本 slice 只解决：

- 一格移动从瞬移变成固定时长的平滑移动；
- 4×4 character sheet 的 4 列 pattern 真正参与绘制；
- 按住方向连续走多格，步态连续；
- 松键后当前一步走完整格，再回站立帧；
- 撞墙只改变朝向，不播放 walking cycle；
- camera 与人物同步平滑移动；
- moving 时 character depth 跟视觉脚点变化，不提前整格切换遮挡。

不解决：

- 跑步、自行车、冲浪、跳跃；
- NPC/Event 移动；
- 地图跳转；
- 通用 Tween/Timeline/Animation/GameLoop framework；
- renderer/subsystem/data 合同修改。

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

Essentials 的关键模型是：

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

真正停止后才回 `0`。

---

## 3. Authority 边界

### Runtime 负责

`@loomrealm-game/map` Runtime 负责：

- 权威格坐标 `x/y`；
- `direction`；
- passability；
- held direction 顺序；
- 是否开始一步；
- 一步何时逻辑完成；
- 连续移动是否进入下一步；
- stop / collision 后的 standing 状态。

### Browser 负责

`game-libs/map/browser/map.browser.js` 负责：

- `requestAnimationFrame()`；
- visual progress；
- sprite screen position interpolation；
- camera interpolation；
- 半步 pattern 切换；
- visual foot depth；
- Canvas 重绘。

### 明确禁止

Runtime 不以 60Hz 连续 `domain.replace()`。

Browser 不决定：

- 能否走；
- 下一格逻辑坐标；
- 是否继续下一格；
- input precedence。

---

## 4. Runtime 最小状态

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

不保存以下重复事实：

```text
toX/toY      // 当前 x/y 已经是目标格
dx/dy        // 只在尝试开始一步时需要
durationMs   // 固定使用 WALK_STEP_MS
```

不引入 `CharacterController`、`AnimationManager`、`Timeline`、`Clock` 等新层。

---

## 5. 一步状态机

### 5.1 Standing

```text
activeMove = null
pattern = 0
```

方向输入到来时：

1. 更新 `direction`；
2. `canMove(...)`；
3. 不可走：只更新朝向并保持 standing；
4. 可走：进入 Walking。

### 5.2 Walking start

成功开始一步：

```ts
const fromX = x;
const fromY = y;

x += dx;
y += dy;

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
2. setTimeout(finishStep(moveId), WALK_STEP_MS)
```

每一步 Runtime 只发送一次 walking RenderState。

### 5.3 Walking complete

completion callback 必须先检查：

```text
frame.signal.aborted === false
activeMove?.id === moveId
```

有效时：

```text
activeMove = null
```

然后：

- 仍有 held direction：切换 `nextStartPattern` 的 `1 ↔ 3`，立即尝试下一步；
- 已无 held direction：`nextStartPattern = 1`，发送 standing RenderState。

连续步之间不得插入 standing RenderState。

### 5.4 松键

松键不取消已经开始的一步。

角色必须走到目标格中心后再停止。

禁止出现半格 authority。

### 5.5 Collision

不可通行时：

```text
direction 更新
x/y 不变
activeMove = null
pattern = 0
```

不得为了撞墙启动 walking cycle。

---

## 6. Held input

不使用 OS keyboard repeat 作为游戏步频。

Runtime listener 订阅：

```text
keyboard.event
keyboard.state
```

职责：

```text
keyboard.event
→ 维护最近主动按下的方向顺序

keyboard.state
→ held truth

step completion
→ 从仍 held 的最高优先方向决定下一步
```

### 多方向优先级

内部保持一个很小的：

```ts
Direction[]
```

规则候选：

```text
非 repeat keydown：
  将该方向移到数组末尾

keyboard.state：
  删除已经不 held 的方向

选择方向：
  数组末尾的仍 held 方向优先
```

即“最后主动按下的仍 held 方向优先”。

Frozen 版本必须补精确事件序列测试后再锁定，不新增 InputController abstraction。

---

## 7. Player RenderData

Runtime 不发送逐帧 `progress`。

现有字段继续表示目标状态：

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
- `motion.fromScreen*`：一步的视觉起点；
- `motion.fromY`：moving depth 的源 world Y；
- `pattern`：当前一步第一半段的起始 pattern；
- `motion === null`：standing。

不要增加：

```text
progress
elapsedMs
currentVisualX/Y
fromX
```

到 Player RenderData。

---

## 8. `lr-map-sprite`

### 8.1 Pattern

validation 从仅允许：

```text
pattern === 0
```

改为：

```text
0 | 1 | 2 | 3
```

character sheet source X：

```js
sx = pattern * frameWidth;
```

方向行继续沿用当前逻辑。

### 8.2 Walking rAF

`motion !== null`：

```text
receive RenderData
  ↓
startedAt = performance.now()
  ↓
rAF
  ↓
progress = clamp((now - startedAt) / durationMs, 0, 1)
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

新 RenderData 到来时取消旧 rAF；同时用 motion id/current-data guard 防止旧 callback 覆盖新状态。

standing：

- 取消旧 rAF；
- 绘制 `pattern = 0`；
- snap 到目标 screen position。

---

## 9. Moving layering

standing character depth 保持现有整数 `y` 行为。

moving 时不能直接用目标 `y`，否则向下走时会提前整格切换遮挡。

使用视觉脚点像素：

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

Frozen 前用 Chromium compositing test 固定精确 boundary 行为。

---

## 10. Camera motion

只动画 player、不动画 camera 会产生地图 32px 瞬跳，因此 map view 也必须插值。

Runtime 在 step start 计算：

```text
fromCamera = computeCamera(map, fromX, fromY)
targetCamera = computeCamera(map, x, y)
```

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
        fromCameraX,
        fromCameraY,
      }
    : null,
}
```

`cameraX/cameraY` 继续表示目标 camera。

`lr-map-view` 独立执行：

```text
startedAt = performance.now()
visualCamera = lerp(fromCamera, targetCamera, progress)
```

然后按 visual camera 重画已有 Canvas buckets。

### 不共享 Browser animation clock

`lr-map-sprite` 与 `lr-map-view` 各自使用本 element 收到 RenderData 时的 `performance.now()`。

不引入：

```text
MotionClock
SharedTimeline
AnimationEpochRegistry
module-global motion timestamp registry
```

两个 element 来自同一次 RenderDomain 更新；允许 presentation 层存在至多约一帧的启动偏差。自动化测试负责证明不会出现可见的 camera/player 脱节。

---

## 11. Tile overscan

camera 一步最多移动 32px，因此 tile projection 固定增加一格 overscan：

```text
left   -1 tile
right  +1 tile
top    -1 tile
bottom +1 tile
```

受 map bounds clamp。

`projectVisibleTiles()` 内部固定 `overscan = 1`，不新增 public/configurable 参数。

standing 与 moving 都统一投影 overscan，避免 RenderData shape 因运动状态切换。

---

## 12. Clock 与 lifecycle

### Runtime

第一刀直接使用局部 `setTimeout`：

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
clearTimeout(stepTimer)
stepTimer = null
close RenderDomain
```

completion callback 必须再次检查 frame 未 abort 且 move id 仍 current。

### Browser

Browser frame rate 只影响绘制平滑度，不影响逻辑步速。

rAF 使用 elapsed time 算位置；掉帧后直接追到正确 progress，不累计固定像素步长。

新 motion / standing RenderData 必须让旧 rAF 失效。

---

## 13. 预计修改面

Production：

```text
game-libs/map/src/runtime.ts
game-libs/map/src/semantics.ts
game-libs/map/browser/map.browser.js
```

Tests：

```text
game-libs/map/test/semantics.test.mjs
```

以及新增/扩展 root Chromium browser test。

除非已有合同无法表达，否则禁止修改：

```text
packages/renderer/**
packages/subsystem/**
packages/data/**
tools/**
```

---

## 14. 最小测试闭环

### Runtime / semantics

至少覆盖：

1. 成功移动在 step start 只更新一次目标格；
2. collision 不创建 `ActiveMove`；
3. 松键不取消当前一步；
4. held key 在 completion 后启动下一步；
5. 连续 4 格的 `startPattern` 为 `1, 3, 1, 3`；
6. 真正 stop 后回 pattern 0；
7. stale move id completion 无作用；
8. frame abort 后无晚到 replace；
9. held 多方向 precedence；
10. overscan 在 map 四边正确 clamp。

### Browser

至少覆盖：

1. pattern 0/1/2/3 source rect 正确；
2. 一格开始时不瞬移到 target；
3. 约 50% progress 时位于两格中间；
4. 结束后精确落在 target；
5. 半步时 pattern 切换；
6. standing 绘制 pattern 0；
7. 新 motion 使旧 rAF 失效；
8. camera 与人物同步插值，无 32px 瞬跳；
9. moving z-index 随 visual Y 变化；
10. Chromium 最终像素证明跨遮挡 boundary 时前后关系正确。

### 玩家可见验收

真实 Essentials 示例按住一个方向至少走 4 格，必须看到：

- 连续位移；
- 左右脚交替；
- 每格之间无 standing 闪帧；
- 松键后走完当前格再停；
- 停下后回 standing；
- 撞墙不原地踏步；
- camera 跟随平滑；
- 穿过树冠/屋檐边界时遮挡没有提前或滞后一整格。

---

## 15. 抽象预算

本 slice 明确禁止新增：

```text
AnimationManager
Timeline
Tween service
GameLoop framework
CharacterController hierarchy
SceneGraph
Clock abstraction
MotionClock
SharedTimeline
```

当前只有一个玩家角色、一种 walking speed、一个固定 step duration。

允许的新长期状态仅限：

```text
Runtime:
  heldDirections
  activeMove
  nextMoveId
  nextStartPattern
  stepTimer

lr-map-sprite:
  current rAF handle / motion id

lr-map-view:
  current rAF handle / motion id
```

优先保持代码局部、显式、可测试。

---

## 16. 冻结前必须关闭的问题

在把本文改为 `Frozen for implementation` 前，只剩以下事项必须写死：

1. 多方向 held precedence 的精确事件序列与测试向量；
2. moving depth 在关键 pixel boundary 上的 Chromium 实证结果；
3. browser test 的确切文件、fixture、执行命令；
4. 真实 Essentials v21.1 素材验收场景与预期 evidence。

已经关闭、不再交给实施者选择：

- Runtime timer：局部 `setTimeout` + abort `clearTimeout`；
- Browser 时钟：两个 custom element 独立 rAF，不共享 animation clock；
- tile overscan：`projectVisibleTiles()` 内部固定 1 tile，不参数化；
- `ActiveMove`：只保存 `id/fromX/fromY/startPattern`；
- Player motion：只传 `id/durationMs/fromY/fromScreenX/fromScreenY`。

---

## 17. 目标闭环

```text
keyboard event/state
        ↓
Runtime held order + direction
        ↓
canMove
   ┌────┴────┐
 blocked    passable
   │           │
standing    ActiveMove
pattern 0   x/y → target
               │
               │ one RenderState
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
      Runtime step completion
          ┌────┴────┐
        held      released
          │           │
      next step    standing 0
```

本 slice 完成时必须同时闭合：

- authority；
- input cadence；
- 一格移动；
- pattern；
- camera；
- layering；
- lifecycle；
- 自动化测试；
- 真实素材可见验收。
