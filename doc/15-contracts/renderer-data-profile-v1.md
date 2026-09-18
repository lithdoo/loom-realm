# Renderer ⇄ Subsystem Data Application Profile v1

> 层级：正式契约 / Application Profile；状态：**Revised normative candidate / Docs Freeze HOLD / not implemented**；2026-09-18。
> identity：`loomrealm.renderer-data/1`；决策：[ADR 0036](../decisions/0036-preimplementation-viewport-profile-v1-correction.md)；child：[Connection v1](./renderer-subsystem-data-connection-v1.md)、[Input v1](./user-input-v1.md)、[Render v1](./render-update-v1.md)、[Viewport v1](./viewport-state-v1.md)；[Conformance revision3](./renderer-data-profile-conformance-v1.md)；[唯一冻结账本](../30-implementation/viewport-core-freeze-ledger.md)。

**修订候选，不是旧代码现状。** 实际代码仍支持三 child；原完整 Frozen 文本作为 [逐字基线](./renderer-data-profile-v1-previewport-baseline.md) 存档。该基线仅供未改变语义的精确保全，不是另一个 current Profile。此文仅覆盖下文明确的差异，原基线中其余所有 MUST/MUST NOT、顺序、错误、限制、recovery 原样继承；冲突必须停止并提交设计审查，不由实施 Agent 静默选择。

## 1. Composition / authority

唯一目标 identity `loomrealm.renderer-data/1 = Connection1 + Input1 + Render1 + Viewport1`，缺任何 child 不得宣称新版 `/1`。原基线 §1 三 child closed set、§4 两 namespace、§14 相应总表由本修订取代；基线 §2 Main 独占 Session/Renderer/DataAuthority `{subsystemKey,generation,dataProfile}`、Broker 只配对 already-current carrier、Profile 不取得 Frame/InputTarget/Render authority、Data absent 不等于 Runtime 失败均不变。Main 不持有 width/height。当前修订是获授权的首次发布前同 identity 整体协调升级，**不是**基线 §12 所禁止的无声、无治理升级。任何今后真实不同 Profile identity 仍遵循基线的 fresh-generation 规则。

旧三-child binary 和新版四-child binary 不可混连；所有实际相连组件按同一个受治理构建批次升级。没有协议内 fingerprint/handshake/自动兼容。若确有必须与旧 peer 共存的事实 STOP 并另作迁移决策；不得用旧 `/1` 可运行证明新 `/1` 资格。没有 `/2`、双 parser、deprecated alias、按业务选 identity 或按 map 存在性降级。

## 2. Unit、closed namespace 与方向

原基线 §3 的单位和 common preflight 逐字继承：one UTF-8 JSON string=one child object；WebSocket complete text / MessagePort string；实际 bytes≤1,048,576、JSON depth≤64、既有 Wire parse/representation；先 common gate 后 exact child validation，旧 payload/structural limits 不变。新增唯一个 `viewport.state` 的 own-key closed `{type,width,height}`，正 safe integer CSS logical px，仅 Renderer→Subsystem，具体校验由 [Viewport child §2](./viewport-state-v1.md) 唯一定义。

完整合法消息：Subsystem→Renderer `input.interest`,`render.domains`,`render.snapshot`,`render.patch`,`render.event`；Renderer→Subsystem `input.state`,`input.event`,`input.reset`,`viewport.state`。只有 `input.*`,`render.*`,`viewport.*` 三族；`viewport.foo`/unknown type 归 `protocol:"profile"`，已识别 `viewport.state` 的 shape/value/direction/explicit semantic violation 归 `protocol:"viewport"`。原 Input/Render family 错误归属、已有 stale-drop 均不变；不在 `x.*` 传 geometry。未知 type、错误方向或非法 shape fail-closed，只 terminal 当前 Data peer，不直接终止 Runtime/Frame。

## 3. 单 reader、单 writer、背压

每 current carrier 仍**一个** `carrier.messages()` reader；common preflight 后按 exact type 一次分流 Input/Render/Viewport；child disposition settle 后才继续下一条应用层作用，不绕过现有 reader。每方向仍**一个** serialized writer，physical concurrent `carrier.send≤1`，admitted units 不撤回/改序/重试/迁移。原基线 §5/§6/§7/§8 的 Input/Render reader、writer、child barrier、ordering/authority 保持；增加 Viewport branch 仅改变闭合集合，不授予跨 child ACK、revision 或事务。Viewport 仅消费当前 carrier 的 author observation，不写 Store/Projector。

Viewport publisher 有界机制以 [Viewport child §4](./viewport-state-v1.md) 为唯一算法：每 peer 最多一个已 admitted 或等待 send outcome 的 `inFlight`，一个未 admission 的 latest `pending`；绝不能每 raw resize 先入共享 writer 再去重。1024 只是现有 `DataRuntime` writer 实现容量，不是通用协议阈值。Input/Render 与 Viewport 仍共享 FIFO writer；sender 不得饿死其他 child。`sent` 只表示 carrier-local acceptance，不是对端 ACK。

## 4. Fresh / terminal / independence

原基线 §9 的 Input fresh Interest/State、Render fresh domains→snapshots、same-G 不重启 Runtime/Frame 全部保留；增加 Viewport：每 fresh current carrier 必须独立发送当前合法 raw source 的最新归一化尺寸 baseline，未测得有效尺寸则等待首个合法样本。新 peer sender cursor 从空开始，不能把旧 pending/send state 迁移。相同尺寸的 fresh wire baseline 在 Subsystem 端不产生重复订阅回调，不同尺寸则先更新 getter 再通知。当前 carrier loss 保留 Runtime 最后合法尺寸但不视为 paintability 证明。fresh G/Renderer 时旧 identity callbacks 和 messages fenced；无固定跨 child baseline 顺序、super-snapshot、barrier。

原基线 §10 的 first-wins Data-local terminal、best-effort close、pending settle、Data terminal≠Runtime/Frame/authority/Renderer failure 均继承。新增 `DataProtocolFamily` 仅加入 `"viewport"`；Viewport consumer listener throw/reject 由 Subsystem 本地 contain，不能冒充 child protocol-invalid。原基线 §11 的 boundedness/无 replay 继续适用。

## 5. 受保护基线继承 crosswalk / 资格

| 旧全文段落 | 修订结果 |
|---|---|
| §1、§4、§14 涉及三 child、两 namespace、directions/final invariants | 本文 §1–2 精确覆盖为四 child、三 namespace、唯一 Viewport 方向 |
| §2 authority、§3 application unit/common preflight | 完整保留；Main 不增加 size |
| §5 reader、§6 writer、§7 child outcomes、§8 ordering | 完整保留既有行为，仅增加 exact viewport branch + 有界 sender |
| §9 fresh baseline | 旧两个 child 原义保留；增加独立 viewport baseline |
| §10 terminal、§11 backpressure | 原义保留；新增 viewport 错误 family 与 publisher 上限 |
| §12 evolution | 现有获授权 pre-release `/1` 修订为唯一显式例外；未来仍按既有治理 |
| §13 conformance | 修订为 [revision3](./renderer-data-profile-conformance-v1.md)；旧 revision2 义务不得删除 |

本次规范只是 Docs Freeze 候选；冻结需要账本中 final docs SHA、交叉审查及负责人批准。实施后用相同 executable SHA 运行 revision3、Viewport conformance、原 Connection/Input/Render、受影响架构 vertical 与回归；不能转移旧 PASS。