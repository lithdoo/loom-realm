# ADR 0025 — Renderer Data Profile v1 preimplementation closure

> 状态：**Accepted / partially updated by ADR0037**。本 ADR 对 single reader/writer、Data-local terminal、Platform current binding 和首版 package boundary 的决定持续有效；「Profile v1 永远只有 Input+Render」的历史组合已由 [ADR0037](./0037-direct-profile-v1-preimplementation-viewport-correction.md)在首次发布前显式修正。  
> 日期：2026-08-26；部分修正：2026-09-16  
> Current normative：[Profile v1](../15-contracts/renderer-data-profile-v1.md) · [Viewport v1](../15-contracts/viewport-state-v1.md) · [Data Connection v1](../15-contracts/renderer-subsystem-data-connection-v1.md)

## Context / historical baseline

最初 Data Connection v1 + Input v1 + Render v1 已 Frozen，而组合 Profile仍 Draft。实现不能临时决定谁读唯一 carrier stream、并发 writer、type/direction fail-closed、child fatal/terminal、fresh carrier queue以及 `@loomrealm/data`是否负责物理连接。本 ADR在当时无第三方 deployed `/1` obligation的背景下将三-child `/1` 收口。后来的真实 viewport gap与 ADR0037要求更新该**同一首版 identity**为四 child；历史三 child定义不再是当前实现目标，也不得从本 ADR恢复 fake `/2`。

## 持续有效的 Decisions

1. **已安装 carrier 才能进入 Profile。** Platform DataConnectionBroker拥有 candidate establishment/auth/ticket、paired readiness、Main authority revalidation、serialized cutover与 transport provisioning。`@loomrealm/data`仅消费 already-current `MessageCarrier<string>` binding，不提供 `connect(url)`。
2. **一个 inbound reader + exact dispatcher。** 只有一个 `carrier.messages()` consumer，common preflight后按当前 Profile v1 的 exact child type路由；各 child不得竞读。当前增加 `viewport.state`，不改变这条机制。
3. **一个 outbound serialized writer。** 每 carrier每方向最多一个 pending physical `carrier.send`；所有 Input/Render/Viewport sender共用；该顺序不创造 shared revision、transaction、Input↔Render ACK、cross-child atomicity。Child在 admission之前维护各自 coalescing/barrier；Viewport有独立 one-in-flight+one-latest slot。
4. **common preflight只提升真实共享事实。** UTF-8 unit ≤1MiB、JSON depth≤64、现有 Wire representation/parse；其他 identifiers/count/payload/structural limits仍归 child validator，不建第二套通用 limits。
5. **role direction exact。** 当前 [Profile v1](../15-contracts/renderer-data-profile-v1.md) 定义完整四 child方向。Unknown/wrong direction/shape invalid Data-fatal，不作为扩展忽略。Trusted illegal send在本地拒绝，不能写 carrier。
6. **child stateful outcome。** Profile负责 static validation/terminal，child维护 Input stale applicability、Render registry/revision及 Viewport retained/currentness；`accepted`可包括 contract认可的 stale-drop，显式 `protocol-fatal`退休 Data。业务 callback exception不是 peer malformed。
7. **terminal first-wins。** Pending writer work settle once，fatal best-effort close，无 retry/replay、不迁移旧 carrier unsent queue；fresh carrier根据 current child事实分别重建 baseline。
8. **package placement。** `@loomrealm/data`是完整 Profile/wire/capability package，拥有 codecs、dispatcher、writer和 typed peer，不拥有 InputListener、RenderDomain、Main DataAuthority、Broker、WebSocket/MessagePort物理来源。`@loomrealm/subsystem`仍是唯一 author surface，root-only package API，不为了 child对称添加 `/input`、`/render`、`/viewport`、`/profile`等 subpaths或新的 npm 子包。
9. **implementation ownership。** Shared mechanics属于 `@loomrealm/data`；InputManager/RenderManager等业务 Role State由其 Subsystem/Renderer owner承担。Viewport 由新增小型 sender/retained author capability承担，不让 `@loomrealm/data`变成 Environment/Map manager。

## 本次 partial update / version governance

原表述 `Connection1 + Input1 + Render1 = /1` 和 `只有 input.* / render.*` 属于 2026-08-26 的历史 snapshot，已不适用现行 corrected-first-v1：`/1 = Connection1 + Input1 + Render1 + Viewport1`。**不得**把本文件用来拒绝 `viewport.state`或坚持生产 `/2`。前述 owner、preflight、reader/writer、terminal机制保持不变；具体完整 acceptance与diagnostic现在由修正后的 Profile v1独占。新的 conformance fixture revision及执行证据不能继承旧旧三-child PASS。

原兼容性限制（形成真实 boundary后 schema/identity/direction/encoding/order/terminal change应 version/migrate）继续有效。此次允许 direct correction 的条件是首次发布前确认**没有真实外部兼容义务**、ADR显式说明、传播全部 current docs/tests并留新资格 subject；这一证据仍为 Docs Freeze签署条件，不能只凭仓库 Releases为空断言已满足。

## Rejected alternatives（仍有效）

各 child各自读取 carrier、各自并发写 carrier、新 Input/Render npm packages、Data package兼任 Broker、额外 Data handshake/ACK/shared revision、没有 consumer证据的 generic framework，仍被拒绝。Map/camera/chunk/menu policy不能上升为 Profile semantics。