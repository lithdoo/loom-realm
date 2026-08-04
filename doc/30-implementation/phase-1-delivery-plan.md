# 第一阶段交付计划

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Evolving  
> 主要定义：第一阶段实施顺序、里程碑和关闭条件  
> 依赖：[仓库与分包方案](./repository-layout.md)、[测试策略](./testing-strategy.md)  
> 最近复核：2026-08-04

## 里程碑 0：文档与契约基线

已收敛：

- Game Package v2 / Desktop Node.js Launcher v1；
- Subsystem Control Protocol v1；
- Frame / Call Batch A：identity / authority / lifecycle / Activation；
- Batch B：exact seven RPC wire / local semantics；
- Batch C：transaction / acceptance barrier / InputTarget publication / rollback boundary；
- Batch D：semantic error / finite deadline / ambiguous result / no-retry / cancellation boundary；
- Batch E：Runtime failure lowest-root suffix unwind / fixed-point recovery / outcome preservation / surviving Caller resume；
- ordinary call无 reverse `frame.suspend`；call/return Response先于 dependent reverse RPC；
- activate/resume ACK先于对应 InputTarget publication；
- timeout/Response-loss不猜测、不 retry；
- Runtime failure以 subsystem key为单位，whole suffix deterministic unwind；
- failed Runtime Frame logical retire无 close ACK；healthy descendant best-effort close；
- cleanup二次 failure会扩大 failed set/root；
- accepted outcome不可覆盖；root无 outcome使用 `SUBSYSTEM_RUNTIME_FAILED`；
- surviving Caller只 fresh-resume；no caller-driven cancel / no recovery abort-unwind wire；
- Render = Subsystem-owned Context；每 Subsystem一个 Runtime Container / 最多一个 Renderer Data Connection。

当前唯一 Frame / Call 冻结目标：

```text
Batch F
    wire limits
    complete A-E conformance fixtures
    finite-deadline Profile configuration
    Desktop/PWA transport-independent conformance
    Frame/Call profile/version completion
    overall protocol → Active / Normative / Frozen
```

之后：Main⇄Renderer Control → Renderer⇄Subsystem Connection → User Input → Render Update → Render State。

里程碑 0 关闭条件：Launcher、Subsystem Control、Frame Batch A-E 均有权威 Contract / ADR / conformance target；Legacy Frame lifecycle/retry/resync/partial-unwind模型不作为实现入口。

## 里程碑 1：Game Package v2 与 Desktop Runtime Bootstrap / Control

目标：零 Frame 条件下完成 Runtime Bootstrap、Control identity、ready、normal shutdown 与 failure convergence。

实现 Descriptor Loader / Entry Resolver / Node Launcher / Bootstrap Context / Supervisor / Control WebSocket / hello/status/shutdown / semantic errors / wire limits / cleanup。

## 里程碑 2：Frame / Call Control

目标：在 ready Runtime上实现 Frozen Frame A-E，Batch F完成后锁定 v1。

### Batch A/B — Frozen

Frame identity/lifecycle/Activation/Caller/Stack ownership；exact seven JSON-RPC Requests / closed schema；Caller不在 wire；close无 reason；resume=outcome+new Activation；无 ready/status/system.call/frame.result/cancel。

### Batch C — Frozen

```text
initial: initialize ACK → activate ACK → commit/publish
call: acceptance commit → call Success → Child initialize/activate → ACK/publish
return: acceptance commit → return Success → close ACK/pop → resume ACK/publish
```

Pre-commit recoverable abort；post-commit facts no rollback；same-Subsystem recursion不要求 nested handler。

### Batch D — Frozen

```text
Success        → known committed
Explicit Error → known not committed
Timeout/loss   → ambiguous → Runtime failure
```

Finite deadline；no retry/replay；recoverable error vs divergence/protocol fatal；no caller-driven cancel。

### Batch E — Frozen

```text
failedRuntimeKeys
→ lowest live failed-runtime Frame = root
→ root..top whole suffix doomed
→ Top→Bottom cleanup
→ failed Runtime Frame logical retire
→ healthy descendant best-effort close
→ cleanup failure expands failed set/root
→ repeat to fixed point
→ preserve accepted root outcome
   or synthesize SUBSYSTEM_RUNTIME_FAILED
→ fresh-resume direct healthy Caller
   or Stack empty
```

Recovery不额外要求 suspend-before-close，也不新增 abort/unwind/replay/resync RPC。

### Batch F — Next / Final

冻结 wire numeric/string/payload/nesting limits、完整 A-E fixture/golden、deadline Profile configuration、Desktop/PWA transport-independent conformance 与 profile/version binding，之后 Frame / Call v1整体转 Active / Normative / Frozen。

里程碑 2 关闭条件：Batch A-F Frozen，并通过 same-Subsystem recursion、timeout/no-retry、divergence、post-commit no rollback、multi-Frame failure unwind、cleanup root expansion、accepted outcome preservation、stale Activation conformance。

## 里程碑 3：Renderer Control 与 System Data Connection

目标：建立 Main-authorized per-Subsystem Data Transport，并服从 Frame A-E causal/recovery barrier。

必须支持 Runtime State / Frame Stack/lifecycle/current Activation/InputTarget publication；ACK-before-publish；revoked Activation不重新发布；`InputTarget=null` normal/recovery gap；no two InputTargets；Runtime failure期间 Renderer不得猜测 unwind/root 或恢复 cached Activation。

## 里程碑 4：User Input Protocol

冻结 `subsystemRef + frameId + activationId`；只接受 Main-authorized active/current Activation；stale Activation拒绝；outbound mutation gate/failure recovery期间 ordinary input不进入业务 Handler；定义 continuous/discrete/reset/ordering/backpressure。

## 里程碑 5：Render Update 与 Web Renderer

冻结独立 Render identity/lifecycle/state/event/revision/recovery；支持 zero-frame Render、Frame close/unwind后 Render独立、Renderer reload独立恢复。

## 里程碑 6：Content API 与游戏内容

实现 Safe Package Root、Catalog / Package Index、Readonly Content Service、resource/MIME/ETag/Content Version 与 validate。

## 里程碑 7：`loom.map` 最小运行时

实现 Subsystem Control Adapter；Batch A-E Frame Adapter；mutation gate + deadline handler；initialize business rejection；timeout/divergence failure reporting；active/current Activation input routing；健康 doomed map Frame `frame.close` cleanup；Runtime failed时不本地恢复 lower map Frame；Runtime Core/Loop、移动/碰撞/Portal、Render Manager/Projector。

## 里程碑 8：Pokémon Essentials 兼容工具链

定义中间 JSON、导入 Tile/Autotile/Passage/Priority/Character、Golden fixture，受限素材不进入公共仓库。

## 里程碑 9：Hostra Desktop 闭环

Main 与 Hostra 分离；per-Subsystem Control/Data WebSocket；Desktop adapter保持 Batch A-E，包括 finite deadline/no retry/fixed-point failure unwind；Renderer reload只恢复 Main committed state；finite shutdown/force termination。

## 里程碑 10：PWA Transport Profile

Main/Subsystem Dedicated Worker；冻结 Descriptor→Worker / credential / Control MessagePort；精确映射 Subsystem Control v1 与 Frame A-E；MessagePort adapter不得增加 retry/replay/nested reverse-request/recovery wire；Window⇄Subsystem Data MessagePort；Service Worker Content API / OPFS。

## 第一阶段最终验收

- Launcher / Subsystem Control v1符合 Normative Contract；
- Frame / Call v1完成 A-F并整体 Frozen；
- exact seven RPC across Desktop/PWA；
- same-Subsystem recursion无 nested-handler requirement；
- ACK-before-publish；post-commit no rollback；
- finite deadline/no retry/ambiguous Runtime failure；
- recoverable rejection/control divergence正确分类；
- lowest-root whole-suffix fixed-point unwind；
- failed-runtime Frame logical retire / healthy Frame best-effort close；
- accepted outcome preservation / `SUBSYSTEM_RUNTIME_FAILED` / fresh Caller resume；
- no caller-driven cancel / no recovery abort-unwind/replay；
- stale Activation永久拒绝；
- Frame不拥有 Render；zero-frame Render可工作；
- Content API只读且路径安全；Hostra不承载 Main。

## 暂缓

Save System、不可信 executable Sandbox、第二 Launcher、automatic Runtime recovery/restart、Control heartbeat、same-attempt reconnect、lazy/idle recycle、多 Runtime per key、Host timeout默认数值、Bootstrap Token exact entropy、Publisher Trust/signing、多主栈/Frame Graph、Frame migration、Activation reuse、caller-driven Frame cancellation、Frame RPC replay/resync、transparent partial-Runtime recovery、完整菜单/战斗/任务、多人同步、高级渲染优化、ZIP/ASAR/remote package。
