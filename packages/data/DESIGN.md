# `@loomrealm/data`：当前实现与职责

> **Current implementation projection；修正后的四子项 `loomrealm.renderer-data/1` 已有生产代码。** 本页不签署当前 main 的 M11/Viewport 资格。精确旧／新 subject、实际 Node/平台结果见[Viewport 资格 ledger](../../doc/30-implementation/viewport-profile-v1-qualification.md)和[路线图](../../doc/30-implementation/roadmap.md)，不把旧 M8 三子项 PASS 迁移成当前 SHA PASS。

本页承接原先历史 M8 DESIGN 和 Viewport 实施增量中的**当前有效包级语义**，不再用两份旧文档分别声称“尚未实现”。历史 22 KB 详细基线、增量和评审均可在[整改前固定 main](https://github.com/lithdoo/loom-realm/tree/c00fe76b20ab07aeebe18a8056e39a024a9f9859/packages/data)查阅；历史 NOT IMPLEMENTED 只代表当时状态。正式 ABI/限制以现行跨角色协议、`src/model.ts` 与受影响测试为准，历史过程不产生另一份协议。

## 1. 位置与唯一权威

```text
Platform DataConnectionBroker（候选/成对 ready/current 安装权威）
→ 已通过 current 校验的 MessageCarrier<string>
→ @loomrealm/data（profile identity + exact binding/validation；单 reader / ordered dispatcher / 单 writer / terminal）
→ Subsystem / Renderer 各自的应用角色管理器
```

本包只负责 connection-local mechanics：Profile identity、`DataCurrentBindingV1` shape 与零副作用前置校验、UTF-8/JSON/depth 上限、Wire 表示校验、exact type/方向分发、静态子协议验证、carrier 顺序、串行有界 send、远端协议失败分类、终态 first-wins/close 与 fresh peer 零继承状态。**不拥有** Main DataAuthority/InputTarget、Session/Renderer participant currentness、Platform 安装决定、Frame/Activation、Subsystem InputInterest 生命周期、Renderer Render Store/Domain、Viewport 物理来源或 Map Canvas、WebSocket/MessagePort/process、Content 与业务策略。业务作者不直接消费 Data mechanics。

仅依赖 `@loomrealm/foundation` 与 `@loomrealm/wire`；Node ≥20、ESM、browser-compatible、root export only，不新增 `node:*`、平台实现、私有 package subpath、dual parser 或未来 Profile `/2`。历史旧三子项 `/1` binary 不允许与新四子项 `/1` binary 混配；当前四子项修订以 [ADR0037](../../doc/decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md) 为设计原因，发布实际兼容义务另按治理规则检查。

## 2. 单一四子项 Profile `/1`

四个 child 为 Connection1、Input1、Render1 和 Viewport1。最小真实公开入口见 [`src/index.ts`](./src/index.ts)、权威 TS 形状见 [`src/model.ts`](./src/model.ts)，validator 与确切方向见 [`src/profile-codec.ts`](./src/profile-codec.ts)。

```ts
export const RENDERER_DATA_PROFILE_V1 = 'loomrealm.renderer-data/1';
interface DataCurrentBindingV1 {
  readonly carrier: MessageCarrier;
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: 'loomrealm.renderer-data/1';
}
interface ViewportStateV1 {
  readonly type: 'viewport.state';
  readonly width: number;
  readonly height: number;
}
```

Subsystem peer：`createSubsystemDataPeer({binding,handlers})`；接收 `input.state/event/reset` 和 `viewport.state`，发送 `input.interest`、`render.domains/snapshot/patch/event`。`SubsystemDataHandlers` 实际包含 `onViewportState`，Subview/Render writer 经 `.input`/`.render` 访问。

Renderer peer：`createRendererDataPeer({binding,handlers})`；接收 `input.interest` 与 `render.*`，发送 `input.state/event/reset` 和 `viewport.state`，其中 `viewport.sendState` 是当前已实现的发送入口。Renderer 不从 Viewport 推导 InputTarget、Frame 状态或业务地图尺寸；物理视口采集、业务裁剪与订阅者分别归消费者。

所有公开消息均经验证的 `RendererDataMessageV1 = UserInputMessageV1 | RenderUpdateMessageV1 | ViewportStateV1`，`DataProtocolFamily` 是 `profile | input | render | viewport`。`protocolFamilyOfType('viewport.state')` 精确归入 viewport；未知 type 或错误 role 方向 fail-closed。`profile-codec.ts` 先检查应用 unit 是字符串、1 MiB UTF-8 限额、JSON/64-depth，再分派精确 Input/Render/Viewport validators；发送端也进行完整边界验证，不能靠浏览器 UI 或静默 coercion 替代协议检查。

## 3. 顺序、生命周期与失败闭环

每个 peer 恰有一个 carrier reader；按 carrier 顺序同步接收并有序处理 handler，单一串行 writer 防止并发 send 乱序。Role handler 的 `accepted | protocol-fatal` 结果可显式升级为终态；本地 exception、carrier close/loss、远端 protocol-fatal 按已发布 terminal 类型区分，first-wins，不允许在终止后再次制造另一根因。`terminal` 为 Promise；`close()` 有确定终止及清理行为，post-terminal send/reader 不得恢复状态。binding 校验必须在任何 `messages()`/`send()` 作用前完成；本包不能自己选择/更换 Session、generation 或 carrier。

## 4. 权威契约与资格

正式协议：[Profile `/1`](../../doc/15-contracts/renderer-data-profile-v1.md)、[Profile conformance](../../doc/15-contracts/renderer-data-profile-conformance-v1.md)、[Connection](../../doc/15-contracts/renderer-subsystem-data-connection-v1.md)、[User Input](../../doc/15-contracts/user-input-v1.md)、[Render Update](../../doc/15-contracts/render-update-v1.md)、[Viewport State](../../doc/15-contracts/viewport-state-v1.md)与[Viewport conformance](../../doc/15-contracts/viewport-state-conformance-v1.md)。本页是包级实现投影；如有字段/限制差异，以正式协议及相应源码/fixture 确认，不通过旧设计正文重引入三子项旧 ABI。

验证入口：`npm test -w @loomrealm/data`、四子项相关 conformance、`test:m11` 及消费端集成。资格是否适用于当前 main SHA 取决于实际 ledger 与同 SHA CI；历史独立 reviewer、M8 评审或旧 revision2 fixture 不能替代当前执行。PWA M16/M17 仍按[路线图](../../doc/30-implementation/roadmap.md)处理，不能因 Desktop Viewport qualification 自动记 PWA PASS。
