# 测试策略

> 层级：实施计划  
> 状态：Draft / Tracking  
> 稳定程度：Evolving  
> 主要定义：Game/Platform launch preflight、protocol conformance、Role/SDK control-flow、Runner provisioning、Hostra/PWA semantic equivalence 与 E2E  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[正式契约目录](../15-contracts/README.md)、[独立分包与发布架构](./package-architecture.md)  
> 最近复核：2026-08-20

测试目标是验证每一层不能绕过 authority/failure/lifecycle/preflight invariant。

---

## 1. Test Layers

```text
Game common manifest
→ Platform launch manifest
→ exact join + preflight LaunchPlan
→ Wire primitive
→ Protocol/state machine
→ Role/SDK control-flow
→ RuntimeHosting/Runner integration
→ provisioning/technical adapters
→ Platform composition
→ Hostra/PWA abstract-trace equivalence
→ E2E
```

---

## 2. Game Package

```text
valid minimal Game Entry
formatVersion == 1
closed Game/initial/descriptor schema
Descriptor = {key}
key uniqueness/case-sensitive
initial target declared
initial input JsonValue
module/launcher/env/platform fields rejected
validation does no I/O/module import/Runtime side effect
```

---

## 3. Hostra Launch Planning

```text
valid launch.hostra.json
closed schema
missing/duplicate/extra binding
exact Game↔Hostra key set
module syntax/.mjs
absolute/traversal/url/backslash rejection
filesystem containment/symlink safety
all required modules resolve before first process spawn
host Node/Runner policy unavailable fails preflight
manifest cannot override Node/Runner/argv/env/token
frozen plan lookup by key
Main launch request contains no module
```

---

## 4. PWA Launch Planning

```text
valid launch.pwa.json
closed schema
missing/duplicate/extra binding
exact Game↔PWA key set
module syntax/.mjs
external URL/traversal rejection
installation/same-origin resolution
all required modules resolve before first Worker creation
Worker/MessageChannel/security capability fail preflight
manifest cannot override Runner/Port/CSP credential policy
frozen plan lookup by key
Main launch request contains no module
```

---

## 5. Preflight Transaction Invariant

必须显式 fault-inject到每一步：

```text
Game parse/validate
Platform parse/validate
key join
module resolve Nth item
hosting capability check
plan freeze
```

并断言失败时：

```text
process/Worker create count = 0
business module import count = 0
Runtime Control establish count = 0
```

这是新的 launch closure hard gate。

---

## 6. Runtime / Control / Frame

保持：hello-first、token binding、launch/connected/identified/ready区分、Control+Frame one dispatcher、shared Request ID、JSON-text unit、no Batch、no retry。

Frame v1继续验证 exact seven Requests、causal barriers、commit classification、ambiguous Runtime-fatal、fixed-point unwind。

---

## 7. Subsystem SDK

必须继续证明：initialize不启动业务 handler；activate exactly once；child outcomes resolve；pre-commit recoverable rejection可 catch；Runtime-fatal/ambiguous绝不重新进入 continuation；business exception→Frame failed；administrative suspend丢弃 late result。

---

## 8. Renderer/Data/Input/Render

Renderer Control、Data Profile、Data Connection、Input Interest/Activation、Render Domain/revision/fresh baseline等既有 conformance保持不变。

Data provisioning failure不失败 Runtime/Frame。

---

## 9. Runner Tests

Hostra：Host-owned Runner是 process argv entry、planned module exact import、spawn/connected/identified/ready区分、unexpected code0 exit fails Runtime、no auto restart、provisioning distinct from Control/stdout/Data。

PWA：Host-owned Worker Runner是 constructor entry、planned module exact import、Control `postMessage(string)`、Worker termination failure、provisioning Port distinct from application carrier。

---

## 10. Public Surface / Dependency Tests

```text
business → @loomrealm/subsystem only
main does not depend on game-launcher-*
game-package has no platform/module resolver
game-launcher-* may depend on game-package + subsystem/host
game-launcher-hostra contains no PWA schema
game-launcher-pwa contains no Hostra schema
role core does not import apps/* or concrete platform launch config
```

---

## 11. Cross-platform Abstract Trace

共享：

```text
same Game Entry logical topology
same subsystem keys
same logical initial/frame/input scenario
same content fixture/business expectations
same formal protocol/profile semantics
```

允许：

```text
Hostra launch manifest != PWA launch manifest
Hostra Definition artifact != PWA Definition artifact
```

比较：Runtime lifecycle、Frame Stack/Activation/Outcome/unwind、Renderer S/G/P、Data lifecycle、Input logical delivery、Render authoritative replica、Content logical response、business observable state。

不比较：module path/bytes、PID/Worker、IPC/ticket/Port、WS URL/MessagePort、HTTP/SW internals。

---

## 12. E2E

共同 scenario：

```text
Game common bootstrap
Platform preflight plan
all required Runtime ready
initial Frame
nested outcomes/recoverable rejection
Data establishment
Input/Render/Content
same-generation Data reconnect
Renderer reload
shutdown
```

另有 ambiguous Frame failure E2E，断言 no business continuation reentry + Main unwind convergence。

---

## 13. Done Criteria

```text
common Game tests pass
Hostra/PWA manifest + exact-join + zero-side-effect preflight pass
protocol/profile fixtures pass
SDK negative invariants pass
Runner/supervision/provisioning pass
Desktop E2E pass
PWA E2E pass
abstract trace equivalent across platform-specific bindings
business source contains no Platform launch branch
no physical executable/Data material leaks into Main/application protocols
```
