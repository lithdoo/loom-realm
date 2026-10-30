# Renderer Data Application Profile v1 Conformance

> 层级：正式契约 / Conformance Specification  
> 状态：**Frozen / Executable-ready / Not Implemented / Not Qualified**  
> Profile identity：`loomrealm.renderer-data/1`；`fixtureSetRevision = 4`
> Contract：[Profile v1](./renderer-data-profile-v1.md) · [Connection v1](./renderer-subsystem-data-connection-v1.md) · [Input v1](./user-input-v1.md) · [Render v1](./render-update-v1.md) · [Viewport v1](./viewport-state-v1.md)  
> 完整历史断言基线：[fixture revision-2 原文](./renderer-data-profile-conformance-v1-previewport-baseline.md) · [受保护规则与范围](../30-implementation/viewport-scope-repair-2026-09-16.md)  
> Decision：[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)；最近复核：2026-09-16

**Docs Freeze已在 subject `4cbf620ebe8aec0e7fb33743813c5d1f2885e6a9` 签署。** 实际 logs/environment/executable SHA 归 implementation ledger。Revision 4 继承 revision-3 的 Viewport/cohort correction 与所有未冲突的历史 correctness fixtures，并由 2026-10-30 pre-release correction 覆盖 common/child capacity gates；`/2` 草案 Superseded，不实现双模式。旧 fixture 结果不能冒充 revision-4 PASS。

## 1. Exact identity + coordinated first-release cohort

```text
loomrealm.renderer-data/1
= Connection1 + Input1 + Render1 + Viewport1
```

Revised `/1` 完整支持为 conformant claim 的必要条件。旧三-child `/1` executable 不能被认定为新版合格或自动继承旧 PASS。**相同 `/1` 字符串及 `(S,G,P)` tuple 不能分辨旧三-child/新四-child；没有 handshake、feature bit 或 wire-level mixed-peer detection。** 因此产品部署必须在连接之前用 release/build provenance 和受治理 product composition 确保 Main/Renderer/Subsystem/Data peers 来自同一修正版实现，记录 artifact set/subject SHA/版本和运行路径，不得声称 Data Broker 会“识别并拒绝旧 `/1`”或静默自动升级。一旦存在必须混版/rolling upgrade 的真实要求，STOP direct-v1 reset，另作版本与迁移 ADR；不能靠单一 identity 满足互操作。

Main 拥有 `{S,G,P}` authority，Broker exact paired matching 只检验**逻辑 authority**而非同 identity binary 版本。若 profile 身份真正不匹配/endpoints 不支持按 Connection 规则 Data absent；本次 canonical product 统一部署修正 `/1` 属于[implementation ledger](../30-implementation/viewport-profile-v1-qualification.md)，不写成任意 conformant endpoint 对其他所有 Subsystem 的通用 MUST。

## 2. Application unit/common gates/role direction

Hostra one WebSocket text / PWA `postMessage(string)`；one UTF-8 JSON text string 对应 one exact child object；binary、structured object、Batch 非法。Wire representation/parser 与 exact type/direction/child validation 须先于 mutation；non-string、unknown/wrong-role、invalid shape 均 Data-fatal。超过历史 1 MiB/depth64/member/string 数值的合法 unit 必须按 child semantics 接受；Instrumentation 须证明一个 `carrier.messages()` logical reader、每合法 unit 恰好一个 child handler 且 ordered disposition，无 raw bypass。

Subsystem→Renderer：`input.interest; render.domains/snapshot/patch/event`；Renderer→Subsystem：`input.state/event/reset; viewport.state`。已识别 Viewport child-invalid/explicit fatal→`protocol:"viewport"`；Input/Render 沿旧 family；common/unknown→`"profile"`。Viewport 不会作为 Input 或 Render 消息消费、不直接写 Renderer Store/Projector 或 mint InputTarget。

## 3. One writer and child producer semantics

Single serialized writer max concurrent physical `carrier.send=1`，admitted FIFO、terminal first-wins、pending once-settle/no replay/retry/migration。Generic writer 不以固定 pending count/byte threshold 拒绝合法 unit；`>1024` stalled backlog 是历史阈值回归而非容量。保留 Input coalescing、Input State/Event/Reset barrier 和 Render own ordering。Viewport admission 前每 current carrier≤1 viewport admitted/in-flight +≤1 latest pending；hold writer、连续 geometry 与交错 Input/Render→Viewport 自身无 queue 线性增长/永久饿死其他 child，释放 writer 后最终 latest 收敛。具体见[Viewport conformance §3](./viewport-state-conformance-v1.md)。

## 4. Independent baseline/currentness

Fresh current carrier：Input remote Interest/State/Event empty，re-publish current full interest/effective State，Event future-only；Render first `render.domains`→current snapshots→ordinary work；Viewport 有合法 size 时 fresh baseline 否则首次合法时发。没有跨 child 固定顺序/atomic super-snapshot。Same G reconnect 保留 business InputListener/Domain/Viewport object、fresh per-carrier publication；fresh G/Renderer old traffic/source fenced；Viewport equal baseline suppress callback、changed 先更新 current 再通知。Old pending 不迁到 fresh，retained nonnull 非 paintability。

## 5. Failure/authority/child containment

Malformed Input/Render/Viewport 分别 child Data-fatal，common/profile 错归 profile；只 retire Data，不自动 Runtime/Frame fail、RenderDomain destroy 或 Main mutation。Well-formed stale Input 按其合同 drop；Viewport subscriber throw/thenable reject local containment、不阻塞 reader 或终止 Data。Control/Data 无 global total order 或 cross-child ACK/join。

## 6. Original fixture preservation / qualification after Docs Freeze

历史 observable claim/fixture 必须在新 subject 仍有测试覆盖：profile exact identity/unsupported-before-effects；one reader and each exact original Input/Render dispatch；one JSON text unit/Hostra-PWA string equivalence；one serialized writer；direction errors、child outcome、profile/input/render diagnostic、fail-closed first-wins and once settlement；fresh Input Interest/State and fresh Render registry/snapshot/no old replay；Control/Data no total order；Input coalescing、State convergence 和 local callback failure containment。Revision 4 另证明 historical-cap acceptance、`>1024` backlog、O(1) queue mechanics、terminal reference release 与 local-mechanics failure classification；不恢复旧 capacity semantics。

同一新 executable subject 与**cohort evidence**运行 Connection/Input/Render original regression、revised `/1` fixture revision4、Viewport v1、Main policy/Broker currentness、Desktop/Hostra product、M13/M14/M15受影响回归；PWA 在自身平台里程碑验证 CSS logical source。记录 build artifact inventory、Node/Chromium/Hostra 版本、commands/raw logs/subject SHA。Map resize/menus/chunks/P95 属于 Map 自身 qualification，不可由 Core conformance 推定 PASS。历史 revision1/2/3 仅 provenance、不能冒充 current。
