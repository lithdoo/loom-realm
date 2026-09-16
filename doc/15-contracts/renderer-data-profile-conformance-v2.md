# Renderer Data Profile v2 Conformance

> 层级：正式契约 / Conformance Specification  
> 状态：Draft / Executable-ready Candidate / Not Frozen  
> Contract：[Renderer Data Profile v2](./renderer-data-profile-v2.md) · [Viewport State v1](./viewport-state-v1.md)  
> 最近复核：2026-09-16

Docs Freeze要求完整 expected assertions，而不是 executable PASS。下述 test suite在**实现后**依同一 executable subject运行；v1 conformance必须作为独立 regression保留。

## 1. Identity / Main profile selection

`/1` binding只启用 v1 exact acceptance；`/2` binding启用四 child；unknown profile拒绝按既有 boundary处理。canonical target Main对**所有** current Renderer⇄Subsystem DataAuthorities选 `/2`；Broker两端 exact `(Session,Renderer,S,G,P)`匹配。不得按 subsystemKey/map presence自行混配、carrier negotiation/downgrade。`/1→/2`必须 fresh G；same-generation change拒绝/不能 install。若 `/2` endpoints未同时具备，Data absent，不自动回退 `/1`。Explicit `/1` compatibility中新 SDK `scope.viewport.current`从未接受 v2时为 null；存活 Runtime从 v2迁回 v1不得隐式发生。

## 2. Exact namespace/direction and diagnostics

```text
Subsystem → Renderer: input.interest; render.domains/snapshot/patch/event
Renderer → Subsystem: input.state/event/reset; viewport.state
```

每个合法 kind只命中对应 child；反方向/unknown type Data-fatal。Common malformed/unknown type terminal `protocol:"profile"`；Input/Render child error沿 v1 family；**已识别的 viewport.state malformed/child-fatal → protocol:"viewport"**。Profile-v1 peer的 diagnostic类型和 acceptance集合不变：`viewport.state`在 `/1` 必须 fatal，不得忽略。

## 3. Reader / writer / common preflight

Instrumentation证明每 peer一个 raw reader、有序 dispatcher、一个 serialized writer。child不得绕过 writer，concurrent sends不交错 JSON。每 unit必须 UTF-8 JSON string；non-string、>1MiB、depth>64、invalid JSON/representation在child mutation前拒绝。Viewport不得另建 parser/limit bypass。任一 child protocol-fatal terminal first-wins、pending work恰一次 settle、late units inert；Data failure本身不创建 Runtime fail/Frame unwind/Main authority变更。

## 4. Bounded Viewport under shared writer

运行 [Viewport Conformance §3](./viewport-state-conformance-v1.md) 的 blocked writer、>1024 resizes、interleaved Input/Render；确认最多一个 Viewport writer-admitted/in-flight加一个未 admitted latest slot，普通 burst不引发 writer overflow、最终值收敛、Input/Render无永久饥饿；不增加 generic priority scheduler，不改变 v1 writer/child barriers。old-carrier pending不迁移。单靠 100ms map-side settle不能作为本测试的替代。

## 5. Fresh-carrier child independence

安装 fresh current carrier实际记录每方向 order；Input fresh Interest+State/Event future-only，Render首个 `render.domains`+snapshots，Viewport有合法样本则 fresh current baseline、无合法样本则以后首次合法时发布。无固定 cross-child ordering/atomic super-snapshot。same G reconnect保留 business InputListener/Domain/Viewport对象，Viewport retained equal不重复 callback、changed callback一次；fresh G/Renderer fenced旧 traffic而收敛新尺寸，保留旧 size时不能声称 paintability。测试 Data-only reconnect、fresh Renderer reload和未取得合法样本。

## 6. Child isolation / failure

Viewport只更新 readonly observation，绝不能自发 Renderer Store commit或改变 InputTarget/Interest；malformed viewport不 reset Input、不 destroy Render Domain、不自动 Frame unwind。Malformed Input/Render不通过 Viewport handler；Viewport subscriber throw/rejection local-contained且不阻塞 reader或终止 Data。

## 7. Cross-version regression (implementation evidence)

同 executable subject归档：Profile v1 conformance、Profile v2 conformance、Connection v1、User Input v1、Render Update v1、Viewport State v1、Main authority selection；按治理要求 Node20/24、Desktop/Hostra product实际 pairing/physical-source traces。只在这些命令、raw logs、环境与 subject SHA均可核验时由 qualification ledger宣称 PASS/Closed；Docs Freeze不等待这些实现后 artifacts。