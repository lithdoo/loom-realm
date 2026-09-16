# Renderer Data Application Profile v1 Conformance

> 层级：正式契约 / Conformance Specification  
> 状态：**Revised preimplementation / Executable-ready Candidate / Not Frozen**  
> Profile identity：`loomrealm.renderer-data/1`；`fixtureSetRevision = 3`  
> Contract：[Profile v1](./renderer-data-profile-v1.md) · [Connection v1](./renderer-subsystem-data-connection-v1.md) · [Input v1](./user-input-v1.md) · [Render v1](./render-update-v1.md) · [Viewport v1](./viewport-state-v1.md)  
> 完整历史断言基线：[fixture revision-2 原文](./renderer-data-profile-conformance-v1-previewport-baseline.md) · [受保护规则与范围](../30-implementation/viewport-scope-repair-2026-09-16.md)  
> Decision：[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)；最近复核：2026-09-16

**Docs Freeze要求 executable-ready specification + 真实兼容核查，不需要尚未实施的 PASS。** 实际 logs/environment/executable SHA 归 implementation ledger。Revision 3 **完整继承 revision-2 的所有未冲突断言、harness observables、Input revision-2 correction和测试场景**，只增加第四 Viewport child、相关方向/demux/diag/baseline/bounded producer 与 cohort gate；`/2` 草案 Superseded，不实现双模式。旧 revision-2 原文的三-child closed set、fixture revision 编号及「新增必须另起profile」历史判断仅在上述 ADR0037 精确覆盖处失效；原 §2–§11 其他具体测试不可因为此文件简短而删除。旧 fixture 结果不能冒充 revision-3 PASS。任何未列出冲突 STOP 交设计者裁定，而非由测试 agent 挑选较容易的验收。

## 1. Exact identity + coordinated first-release cohort

```text
loomrealm.renderer-data/1
= Connection1 + Input1 + Render1 + Viewport1
```

Revised `/1` 完整支持为 conformant claim 的必要条件。旧三-child `/1` executable 不能被认定为新版合格或自动继承旧 PASS。**相同 `/1` 字符串及 `(S,G,P)` tuple 不能分辨旧三-child/新四-child；没有 handshake、feature bit 或 wire-level mixed-peer detection。** 因此产品部署必须在连接之前用 release/build provenance 和受治理 product composition 确保 Main/Renderer/Subsystem/Data peers 来自同一修正版实现，记录 artifact set/subject SHA/版本和运行路径，不得声称 Data Broker 会“识别并拒绝旧 `/1`”或静默自动升级。一旦存在必须混版/rolling upgrade 的真实要求，STOP direct-v1 reset，另作版本与迁移 ADR；不能靠单一 identity 满足互操作。

Main 拥有 `{S,G,P}` authority，Broker exact paired matching 只检验**逻辑 authority**而非同 identity binary 版本。若 profile 身份真正不匹配/endpoints 不支持按 Connection 规则 Data absent；本次 canonical product 统一部署修正 `/1` 属于[implementation ledger](../30-implementation/viewport-profile-v1-qualification.md)，不写成任意 conformant endpoint 对其他所有 Subsystem 的通用 MUST。

## 2. Application unit/common gates/role direction

Hostra one WebSocket text / PWA `postMessage(string)`；one UTF-8 JSON text string 对应 one exact child object；binary、structured object、Batch 非法。Actual bytes≤1MiB、depth≤64、Wire representation/parser 与 exact type/direction/child preflight 须先于 mutation；non-string、unknown/wrong-role、invalid shape 均 Data-fatal。Instrumentation 须证明一个 `carrier.messages()` logical reader、每合法 unit 恰好一个 child handler 且 ordered disposition，无 raw bypass。

Subsystem→Renderer：`input.interest; render.domains/snapshot/patch/event`；Renderer→Subsystem：`input.state/event/reset; viewport.state`。已识别 Viewport child-invalid/explicit fatal→`protocol:"viewport"`；Input/Render 沿旧 family；common/unknown→`"profile"`。Viewport 不会作为 Input 或 Render 消息消费、不直接写 Renderer Store/Projector 或 mint InputTarget。

## 3. One writer and bounded child producer

Single serialized writer max concurrent physical `carrier.send=1`，admitted FIFO、terminal first-wins、pending once-settle/no replay/retry/migration。保留 Input revision-2 bounded coalescing、Input State/Event/Reset barrier 和 Render own ordering。Viewport admission 前每 current carrier≤1 viewport admitted/in-flight +≤1 latest pending；hold writer、连续远多于其具体 capacity（目前可以 `>1024` 作为 stress fixture，**并非协议容量**）的合法尺寸与交错 Input/Render→Viewport 自身无 queue 线性增长/overflow fatal/永久饿死其他 child，释放 writer 后最终 latest 收敛；不可撤回已 admitted 或改 generic writer limits/scheduler。具体见[Viewport conformance §3](./viewport-state-conformance-v1.md)。

## 4. Independent baseline/currentness

Fresh current carrier：Input remote Interest/State/Event empty，re-publish current full interest/effective State，Event future-only；Render first `render.domains`→current snapshots→ordinary work；Viewport 有合法 size 时 fresh baseline 否则首次合法时发。没有跨 child 固定顺序/atomic super-snapshot。Same G reconnect 保留 business InputListener/Domain/Viewport object、fresh per-carrier publication；fresh G/Renderer old traffic/source fenced；Viewport equal baseline suppress callback、changed 先更新 current 再通知。Old pending 不迁到 fresh，retained nonnull 非 paintability。

## 5. Failure/authority/child containment

Malformed Input/Render/Viewport 分别 child Data-fatal，common/profile 错归 profile；只 retire Data，不自动 Runtime/Frame fail、RenderDomain destroy 或 Main mutation。Well-formed stale Input 按其合同 drop；Viewport subscriber throw/thenable reject local containment、不阻塞 reader 或终止 Data。Control/Data 无 global total order 或 cross-child ACK/join。

## 6. Original fixture preservation / qualification after Docs Freeze

Revision-2 原文中所有这些 observable claim/fixture 必须在新 subject 仍有测试覆盖：profile exact identity/unsupported-before-effects；one reader and each exact original Input/Render dispatch；one JSON text unit/Hostra-PWA string equivalence；one writer and max one pending physical send；direction errors、child outcome、profile/input/render diagnostic、fail-closed first-wins and once settlement；fresh Input Interest/State and fresh Render registry/snapshot/no old replay；Control/Data no total order；Input revision-2 bounded coalescing、State convergence 和 local callback failure containment。其原 §3 harness observables、§4–§10 scenarios与 §11 revision-2 corrections 保持有效，不得只跑新增 viewport 测试。新增 revision-3 fixture 在此基础上证明 Viewport exact ingress、bounded burst、fresh baseline、subscriber isolation、diagnostic 和同 cohort。

同一新 executable subject 与**cohort evidence**运行 Connection/Input/Render original regression、revised `/1` fixture revision3、Viewport v1、Main policy/Broker currentness、Desktop/Hostra product、M13/M14/M15受影响回归；PWA 在自身平台里程碑验证 CSS logical source。记录 build artifact inventory、Node/Chromium/Hostra 版本、commands/raw logs/subject SHA。Map resize/menus/chunks/P95 属于 Map 自身 qualification，不可由 Core conformance 推定 PASS。历史 revision1/2 仅 provenance、不能冒充 current。
