# 人物行走动画设计草案

> 状态：Draft  
> 目录：`examples/essentials-v21.1-local`  
> 对应需求：`MAP_BEHAVIOR_REQUIREMENTS.md` §2 人物行走动画  
> 目标：在不引入通用动画系统、不修改 LoomRealm framework 合同的前提下，让地图角色具有 Essentials/RMXP 风格的一格移动过程、连续步态、停止回站立帧，以及与 camera / layering 一致的视觉运动。

---

## 1. 范围

本 slice 只解决：

- 一格移动不再瞬移，而是在固定时长内从源格平滑走到目标格；
- 4×4 character sheet 的 4 列 pattern 真正参与绘制；
- 连续按住方向时连续走多格，步态不在每格之间强制回站立；
- 松键后当前一步走完，在格子中心停下并回站立帧；
- 撞墙时只改变朝向，不播放行走动画；
- camera 跟随移动过程平滑变化；
- 人物在移动过程中的 layering 依据视觉脚点实时变化，不提前整格切换遮挡。

本 slice 不解决：

- 跑步、自行车、冲浪、跳跃；
- NPC/Event 移动；
- 地图跳转；
- 通用 Tween/Timeline/Animation framework；
- 修改 renderer/subsystem/data 的既有 input/render 合同。

---

## 2. 当前实现与问题

当前 `game-libs/map/src/runtime.ts` 的行为是：

```text
keydown
  → directionForCode
  → canMove
  → x/y 立即 ±1
  → domain.replace(renderState())
```

Player RenderData 固定：

```text
pattern = 0
screenX = x * 32 - cameraX
screenY = y * 32 - cameraY
```

`lr-map-sprite` 也只接受 `pattern === 0`，绘制 character sheet 第 0 列。

因此当前行为是“逻辑位置和视觉位置同时瞬移一格”，无法满足真实行走体验。

---

## 3. Essentials v21.1 兼容基线

本设计采用 Essentials v21.1 已有移动模型作为兼容基线，而不是重新发明动画节奏。

### 3.1 一格时长

Essentials 默认 walking `move_speed = 3`，一格移动时间为：

```text
0.25 s = 250 ms
```

第一刀冻结候选：

```ts
const WALK_STEP_MS = 250;
```

### 3.2 逻辑坐标与视觉坐标分离

Essentials 的核心行为是：

```text
x/y
= 已决定的逻辑目标格

real_x / real_y
= 从旧格逐帧插值到目标格的视觉位置
```

LoomRealm 对应原则：

```text
Runtime x/y
= 权威逻辑格坐标

ActiveMove
= 当前一步的源格 / 目标格

Browser visual position
= 当前一步的逐帧投影
```

禁止把 Runtime 的 `x/y` 改成浮点数。

### 3.3 Pattern

Essentials character sheet 每个方向有 4 列 pattern：

```text
0, 1, 2, 3
```

静止时回 `pattern = 0`。

开始移动时立即前进一个 pattern；walking 速度下一格 250ms，而完整 4 帧循环约 500ms，因此每格显示两个相邻步态帧。

第一刀目标节奏：

```text
step 1: 1 → 2
step 2: 3 → 0
step 3: 1 → 2
step 4: 3 → 0
```

真正停止后：

```text
pattern → 0
```

---

## 4. Authority 边界

### 4.1 Runtime 负责

`@loomrealm-game/map` Runtime 负责：

- 当前逻辑格 `x/y`；
- 当前 `direction`；
- passability 判定；
- 是否开始一步；
- 当前一步的源格、目标格、duration、步态起始 pattern；
- held-direction 状态；
- 一步何时逻辑完成；
- 连续按住时是否立即开始下一步；
- stop / collision 后的 standing 状态。

### 4.2 Browser 负责

`game-libs/map/browser/map.browser.js` 负责：

- `requestAnimationFrame()`；
- 0..1 visual progress；
- screen position interpolation；
- camera interpolation；
- 当前半步应显示哪一个 pattern；
- visual Y 对应的实时 character depth；
- Canvas 重绘。

### 4.3 明确禁止

Runtime 不以 60Hz 连续 `domain.replace()`。

Browser 不自行决定：

- 能否走；
- 下一格逻辑坐标；
- 是否继续走下一格；
- input precedence。

---

## 5. Runtime 移动状态

保持当前权威字段：

```ts
let x = input.x;
let y = input.y;
let direction: Direction = 2;
```

新增最小 transient state：

```ts
interface ActiveMove {
  readonly id: number;
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  readonly dx: number;
  readonly dy: number;
  readonly durationMs: number;
  readonly startPattern: 1 | 3;
}

let activeMove: ActiveMove | null = null;
let nextMoveId = 1;
let nextStartPattern: 1 | 3 = 1;
```

不引入 `CharacterController`、`AnimationManager`、`Timeline` 等新层。

---

## 6. 一步状态机

### 6.1 Standing

```text
activeMove = null
pattern = 0
```

收到方向输入：

1. 更新 `direction`；
2. `canMove(...)`；
3. 不可走：保持 standing，只更新朝向；
4. 可走：进入 Walking。

### 6.2 Walking 开始

成功开始一步时：

```text
from = 当前 x/y
目标 = from + dx/dy
```

随后立即更新权威逻辑格：

```ts
x += dx;
y += dy;
```

并记录：

```ts
activeMove = {
  id,
  fromX,
  fromY,
  toX: x,
  toY: y,
  dx,
  dy,
  durationMs: 250,
  startPattern: nextStartPattern,
};
```

然后只发送一次新的 RenderState。

### 6.3 Walking 完成

250ms 到达 step completion boundary 后：

- 如果当前一步 id 已经过期：忽略；
- `activeMove = null`；
- 如果仍有有效 held direction：立即开始下一步；
- 如果没有 held direction：发送 standing RenderState，`pattern = 0`。

### 6.4 松键

松开方向时：

```text
已经开始的一步不取消
```

角色必须走完整格，在格子中心停止。

禁止出现半格 authority。

### 6.5 撞墙

不可通行时：

```text
direction 更新
x/y 不变
activeMove = null
pattern = 0
```

不得仅为了“撞墙动作”启动 walking cycle。

---

## 7. 连续按键与输入节奏

### 7.1 不使用 OS keyboard repeat 驱动移动

现有：

```text
keyboard.event.repeat
```

不能作为游戏步频来源。

原因：平台和用户系统的 keyboard repeat rate 不同。

### 7.2 使用 keyboard state

Runtime listener 应订阅：

```text
keyboard.event
keyboard.state
```

`keyboard.state.down` 作为当前 held key 真相。

推荐职责：

```text
keyboard.event
→ 更新“最近主动按下的方向”

keyboard.state
→ 判断方向键当前是否仍被按住

step completion
→ 决定是否开始下一步
```

### 7.3 多方向键优先级

冻结前需明确一种规则，不交给实现者临时选择。

推荐候选：

```text
最后一次非 repeat keydown 的方向优先；
该方向释放后，如其他方向仍 held，则退回最近仍 held 的方向。
```

本项在 Frozen 版本中必须给出确定算法与测试向量。

---

## 8. Player RenderData

不发送逐帧 `progress`。

RenderData 只描述一个 transition。

目标形态：

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
        durationMs: 250,
        fromX: activeMove.fromX,
        fromY: activeMove.fromY,
        fromScreenX,
        fromScreenY,
      }
    : null,
}
```

其中：

- `x/y` 是目标逻辑格；
- `screenX/screenY` 是目标视觉位置；
- `motion.from*` 是这一格的视觉起点；
- `pattern` 是这一格第一半段的起始 pattern；
- `motion === null` 表示 standing。

不要新增 `progress`、`elapsedMs`、`currentVisualX/Y` 到 Runtime RenderData。

---

## 9. `lr-map-sprite` 实现方向

### 9.1 Pattern validation

当前只允许：

```text
pattern === 0
```

改为允许：

```text
0 | 1 | 2 | 3
```

### 9.2 Character sheet source rect

从：

```text
sx = 0
```

改为：

```text
sx = pattern * frameWidth
```

方向仍沿用当前行选择逻辑。

### 9.3 Walking rAF

`motion !== null` 时：

```text
receive RenderData
  ↓
requestAnimationFrame
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

新 motion 到来时，旧 rAF 必须通过 motion id / generation guard 失效，不能继续覆盖新状态。

standing RenderData 到来时：

- 取消旧 motion；
- 绘制 `pattern = 0`；
- snap 到目标 screen position。

---

## 10. Layering 与 visual Y

这是本 slice 与已完成 map layering 的关键接口。

当前 character depth 基于整数逻辑 `y`。

如果 Runtime 在一步开始时立即把：

```text
y = targetY
```

Browser 又直接用 target `y` 算 z-index，那么向下走时人物还没真正走到下一格，遮挡就会提前整格切换。

因此 moving 时 depth 必须跟视觉脚点走。

候选：

```ts
const visualWorldY = lerp(
  motion.fromY,
  data.y,
  progress,
);

const visualFootDepth =
  Math.round(visualWorldY * 32)
  + 32
  + (frameHeight > 32 ? 31 : 0);

style.zIndex = String(characterStackValue(visualFootDepth));
```

standing 时仍使用现有整数 `y` 行为。

冻结前应用 Chromium compositing test 验证人物走过 tile depth boundary 时前后关系只在视觉脚点实际跨过边界后改变。

---

## 11. Camera 插值

只动画 player、不动画 camera 会产生：

```text
人物平滑走
地图瞬间跳 32px
```

因此 map view 必须使用同一步的 duration 插值 camera。

Runtime 在一步开始时计算：

```text
fromCamera = computeCamera(map, fromX, fromY)
targetCamera = computeCamera(map, toX, toY)
```

Map RenderData 增加最小 transition descriptor：

```ts
cameraMotion: activeMove
  ? {
      id: activeMove.id,
      durationMs: 250,
      fromCameraX,
      fromCameraY,
    }
  : null
```

现有：

```text
cameraX / cameraY
```

继续表示目标 camera。

`lr-map-view` 使用 rAF：

```text
visualCamera = lerp(fromCamera, targetCamera, progress)
```

再按 visual camera 重画当前 Canvas buckets。

不增加新的 Camera subsystem。

---

## 12. Tile overscan

当前 `projectVisibleTiles()` 只投影视口覆盖范围。

camera 在 250ms 内最多移动一格（32px），如果只投影目标 viewport，插值途中边缘可能露空。

本 slice 建议把可见 tile 投影扩大一格：

```text
left   -1 tile
right  +1 tile
top    -1 tile
bottom +1 tile
```

仍受 map bounds clamp。

这个 overscan 是 presentation data requirement，不是新地图语义。

冻结前应确认：

- standing 与 moving 都统一使用 overscan，避免 RenderData shape/数量跳变；
- `projectVisibleTiles()` 是否直接固定 overscan=1，还是新增明确参数。

优先推荐固定为 1，避免暴露不必要配置。

---

## 13. Browser 时钟关系

目标关系：

```text
Runtime
step start
   │
   │ one RenderState
   ▼
Browser
rAF visual interpolation
   │
   │ 250ms
   ▼
Runtime
step completion
   │
   ├─ held → next step
   └─ released → standing RenderState
```

原则：

- Runtime 约 4 step/s；
- Browser 可以 60/120Hz 绘制；
- presentation frame rate 不改变逻辑步速；
- Browser 掉帧后用 elapsed time 追到正确位置，不累计固定像素步长。

---

## 14. Abort / lifecycle

Map frame abort 时必须：

- close input listener；
- cancel/stop pending step timer；
- close RenderDomain；
- 不允许旧 completion callback 在 frame 关闭后再发送 RenderState。

Browser element 收到新 motion / standing state 时必须让旧 rAF 失效。

不要求额外引入 shared cancellation framework。

---

## 15. 预计修改面

Production 预计只涉及：

```text
game-libs/map/src/runtime.ts
game-libs/map/src/semantics.ts
game-libs/map/browser/map.browser.js
```

Tests 预计：

```text
game-libs/map/test/semantics.test.mjs
```

并新增/扩展 root Chromium browser test，验证真实 movement/compositing。

除非出现已有合同无法表达的 blocker，否则不修改：

```text
packages/renderer/**
packages/subsystem/**
packages/data/**
tools/**
```

---

## 16. 最小测试闭环

### 16.1 Runtime / semantics

至少覆盖：

1. 成功移动只在 step start 改一次目标格；
2. collision 不创建 ActiveMove；
3. 松键不取消当前一步；
4. held key 在 completion 后启动下一步；
5. 连续 4 格的 startPattern 为：

```text
1, 3, 1, 3
```

6. 真正 stop 后回 pattern 0；
7. step completion callback 不能作用于已过期 move id；
8. frame abort 后无晚到 replace；
9. overscan 在四边 map bounds 下正确 clamp。

### 16.2 Browser

至少覆盖：

1. pattern 0/1/2/3 source rect 正确；
2. 一格开始时不是瞬移到 target；
3. 约 50% progress 时位于两格中间；
4. 结束后精确落在 target；
5. 250ms 内 pattern 从 startPattern 切到下一帧；
6. standing 绘制 pattern 0；
7. 新 motion 使旧 rAF 失效；
8. camera 与人物同步插值，无 32px 瞬跳；
9. walking 过程中 z-index 随 visual Y 变化；
10. Chromium 最终像素证明经过遮挡边界时 layering 正确。

### 16.3 玩家可见验收

真实 Essentials 示例：

```text
按住一个方向至少走 4 格
```

必须看到：

- 人物连续位移；
- 左右脚交替；
- 每格之间无 standing 闪帧；
- 松键后走完当前格再停；
- 停下后回 standing；
- 撞墙不原地踏步；
- camera 跟随平滑；
- 穿过树冠/屋檐前后边界时遮挡没有提前或滞后一整格。

---

## 17. 非目标抽象

本 slice 明确禁止因为“以后可能还有动画”而引入：

```text
AnimationManager
Timeline
Tween service
GameLoop framework
CharacterController hierarchy
SceneGraph
Clock abstraction
```

当前只有一个玩家角色、一种 walking speed、一个固定 step duration。

优先保持代码局部、显式、可测试。

---

## 18. 冻结前必须关闭的问题

在把本文状态从 `Draft` 改为 `Frozen for implementation` 前，需要关闭以下事项：

1. 多方向 held 时的唯一优先级算法；
2. Runtime step timer 使用现有何种 timer/cancellation 机制，确保 frame abort 无晚到 callback；
3. Player/Map 两个 custom element 的 rAF 是否需要共享明确的 motion epoch，还是独立接收时刻已足够；
4. moving character depth 的精确 pixel rounding 规则；
5. `projectVisibleTiles()` overscan=1 的最终 API 形态；
6. browser test 的确切文件、fixture、执行命令；
7. 真实 Essentials v21.1 素材验收场景与预期 evidence。

这些问题在 Frozen 版本中必须被写成唯一规则，不交给实施 agent 自行选择。

---

## 19. 目标闭环

```text
keyboard event/state
        ↓
Runtime direction + held state
        ↓
canMove
   ┌────┴────┐
 blocked    passable
   │           │
standing    ActiveMove
pattern 0   logical x/y → target
               │
               │ one RenderState
               ▼
      Browser motion descriptor
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

做到这里，本 slice 才算同时闭合：

- authority；
- 输入节奏；
- 一格移动；
- 步态；
- camera；
- layering；
- lifecycle；
- 自动化测试；
- 真实素材可见验收。
