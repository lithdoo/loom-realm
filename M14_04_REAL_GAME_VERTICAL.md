# M14 / 04 — First Real Game Vertical

> 状态：Implementation Landing / M14 Pending

## Objective

证明完整 consumer chain，而不是再次证明单个 M10–M13 contract：

```text
concrete example
→ @loomrealm-game/map
→ @loomrealm/subsystem author APIs
→ Frame / Input / Content / Render
→ M13 Web Presentation
→ map-owned Custom Elements
→ observable playable map slice
```

## Required trace

至少覆盖：

```text
prepare/load concrete map data
→ launch map Subsystem
→ initial Frame/business state
→ ContentClient reads normalized map record/resource
→ create InputListener + RenderDomain
→ publish initial map/player Render state
→ M13 Projector creates map WC
→ PresentationResourceClient obtains required presentation bytes when needed
→ directional input accepted through M10 path
→ map business state moves player
→ RenderDomain update
→ existing HTMLElement identity reused where required
→ visible map/player result changes
```

如果所选真实 interaction 自然需要另一个 Subsystem，可增加一次 `frame.call/return`；不得为了覆盖率创建假的 reusable dialogue/battle library。

## Browser evidence

M13 已关闭 generic browser semantics，M14 只证明真实 map consumer 可以自然使用它。仍应使用 real Chromium 观察实际 Custom Element/Canvas/DOM result，但不重复 M13 的全部 unknown-tag/reconnect conformance matrix。

## Performance evidence

记录真实 map workload 下：

```text
Render update frequency
node count / changed-node shape
projection duration distribution
input-to-visible-update latency
```

只有测得同步 projection 产生真实 frame pressure，才允许最小 reopen M13 scheduling mechanics。M14 不预建 Scheduler/EventQueue。

## Failure boundary

Example/game-lib failure 不得通过 shortcut 修改 Main/Renderer authority。Content、Input、Render、Presentation 仍各自服从 M10–M13 frozen semantics。

## Non-goals

```text
Electron BrowserWindow full composition
physical keyboard/gamepad final Desktop path
Renderer reload/shutdown full trace
complete Essentials gameplay
PWA Runtime/equivalence
```

这些分别属于 M15–M17 或后续 game libraries。

## Closure

M14/04 通过时应能人工/自动回答：

> 一个普通 concrete game 是否能只通过 public author contracts 与 reusable game library，在真实 browser presentation 中得到可玩的地图切片？
