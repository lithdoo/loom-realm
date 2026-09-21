# 地图游戏库：当前产品行为

> 实现入口：`game-libs/map` / `@loomrealm-game/map`。当前功能已经由 [PR #43](https://github.com/lithdoo/loom-realm/pull/43) 合入 `main`；**已实现不等于原版 RGSS 逐帧保真或当前 subject 正式资格通过**。资格缺口见[路线图](../../30-implementation/roadmap.md)和[M14 ledger](../../30-implementation/m14-qualification.md)。

## 责任与实际数据流

```text
Essentials / RMXP 源（合法本地）
→ tools/fixtures/essentials-v21.1：选择性导入/校验
→ prepared FSDB：Map / Tileset / 狭义 MapAction + resources
→ M12 ContentClient
→ map-owned Runtime（世界/输入/事件/运动唯一状态）
→ RenderDomain → M11 Renderer Store → M13 Web Presentation
→ game-owned lr-map-view / lr-map-sprite
```

`game-libs/map` 是可复用游戏业务，不是 `packages/map` 或 framework 的新公共地图协议。导入工具不得进入 Runtime；Browser 不反向决定通行或事件；具体 Game Entry 和页面样式归 `examples/essentials-v21.1`。

## 数据与语义

- `Map.data` 保持三维 RGSS Table（z 三层）；`Tileset` 在既有字段上新增与 tileId 对齐的一维 `terrain_tags`。旧记录遵守显式 schema/migration，不得无声地补空数据。
- 地形原值保留 0–17；目前只实现 Neutral(13)、Bridge(15)、Ledge(1) 的相关规则。`None(0)`、`NoEffect(17)` 不等于 Neutral。
- 有效地形解析与 passage 判断是两个不同的纯查询；检测源方向、目标反方向、图层 priority 和 bridgeLevel。失败返回 blocked，不产生半步位移。
- `MapAction` 只投影确有证据的 `pbBridgeOn` / `pbBridgeOff` 页面和占用事实；任意 Ruby 不进入执行路径。其他不透明脚本按关联事件精确拒绝，不阻断无关 NPC/地图。

精确类型和代码以 `game-libs/map/src/semantics.ts`、`runtime.ts` 以及相关 `test/` 为准；本文不复写另一套 ABI。

## 移动 / 事件 / 渲染

- 一个方向输入产出 `blocked | walk | jump` 计划；普通 walk 维持现有产品运动约束。
- 事件顺序：先判本次移动，再根据 blocked/front 或成功 arrival/here 选择合适的触发模式；`event start` 与后续 `execute` 不混为一帧。受阻不得误触发 walk-on Bridge；On/Off 执行完成且方向仍按住时继续下一次正常调度。
- `bridgeLevel` 由 Runtime 唯一持有，当前 0/2；On 后 2、Off 和切图后 0。人物与桥面 depth 必须同时随当前层级重投影，不能靠人物 z-index 固定偏移猜测。
- Ledge 是**一个两格 jump 计划/一个 motionId**，不是两次 walk；落点事件一次，中间格不触发普通 arrival。不能跳时 blocked；跨图 jump 不在当前支持范围。
- Browser 只消费 Runtime 的 motion/depth，运动取消、切图和 resize 必须拒绝过期完成回调。

## 真实场景与验收

Map7→21 连续路线覆盖四对 Bridge On/Off：EV004/028、EV010/007、EV022/020、EV025/023；Map47 覆盖合法两格向下跳、逆向、阻挡、落点事件和边界。事件 ID 仅用于用例识别，运行时代码不得按地图或 ID 硬编码。原创合成 fixture 可覆盖原地图缺少的负例；合法原始素材不分发到公开 CI。

验证入口：`npm test -w @loomrealm-game/map`、`npm run test:m14`、地图产品/Browser E2E、Essentials fixture tests；真实 FSDB 在具备合法本地素材时运行。**静态 replay 不是产品 Browser E2E，浏览器 E2E 也不自动证明原版 RGSS 逐帧等价。**

跨角色规范引用 [User Input v1](../../15-contracts/user-input-v1.md)、[Render Update v1](../../15-contracts/render-update-v1.md)、[Content API v1](../../15-contracts/content-api-v1.md)及[M13 Presentation API](../../15-contracts/web-presentation-api-v1.md)；剩余资格事项只进入[路线图](../../30-implementation/roadmap.md)。
