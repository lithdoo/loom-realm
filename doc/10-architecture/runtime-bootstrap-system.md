# 运行时启动与连接建立系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Game Entry + Platform Launch Manifest preflight、Runtime Runner / Renderer 的逻辑启动顺序、Control/Data 建立与 Platform provisioning  
> 依赖：[系统架构总览](./system-overview.md)、[平台组合系统](./platform-composition-system.md)、[运行承载系统](./runtime-hosting-system.md)  
> 最近复核：2026-08-20

---

## 1. Main vs Platform

```text
Main
    declares logical Session/Runtime authority

Platform
    validates current executable binding
    realizes physical Runner/Renderer/connection/content topology
```

Main不依赖 Node/Worker/WebSocket/MessagePort/module resolver。

---

## 2. Game Package Input

Game Package v1：

```ts
interface SubsystemDescriptorV1 {
  readonly key: string;
}
```

还包含 initial target/input。完整 logical topology先在零副作用阶段校验。

---

## 3. Platform Launch Input

当前平台独立读取：

```text
Hostra → launch.hostra.json
PWA    → launch.pwa.json
```

每个 binding把已声明 key映射到当前平台可执行 Definition Module。

Game Package不读这些 manifest；Main也不持有其 raw内容。

---

## 4. Preflight Closure

Session physical bootstrap前固定：

```text
read/validate Game Entry
→ read/validate current Platform Launch Manifest
→ exact Game↔Platform key-set join
→ resolve every required implementation
→ validate current Platform hosting capability
→ freeze immutable PlatformLaunchPlan
```

任何此阶段错误：

```text
MUST NOT create business Runtime Container
MUST NOT import business Definition Module
MUST NOT establish Runtime Control
```

Phase 1 all required/eager。

---

## 5. Logical Runtime Bootstrap

每个 required Subsystem：

```text
Main creates Launch Attempt
→ generate/register bootstrap token for key
→ RuntimeHosting lookup frozen plan[key]
→ Platform creates Host-owned Runner Container
→ Runner imports planned Definition Module
→ Runner constructs Subsystem-facing Platform Ports
→ Runtime Control carrier
→ subsystem.hello binds key
→ identified
→ definition.initialize
→ ready
```

```text
plan valid != container created != module loaded != connected != identified != ready
```

Module load/ABI failure发生在 Runtime创建之后时使 required bootstrap失败，并进入统一 cleanup；它不把 executable authority移回 Main。

---

## 6. Runner Boundary

```text
Hostra Node Runner / PWA Worker Runner
        │
        ▼
RuntimeControlBinding
SubsystemDataBinding
ContentClient
        │
        ▼
@loomrealm/subsystem/host
        │
        ▼
Platform-selected Definition Module
```

Definition Module不读取 physical bootstrap material或 launch manifest。

---

## 7. Runtime `ready`

`ready`只证明 Runtime required initialization完成并能承担 Runtime Control Profile角色。

不得推导 Renderer/DataAuthority/Data carrier/Input/Render存在。

---

## 8. Runtime State Sources

```text
starting    Main Launch Attempt + Platform launch intent
connected   Main accepts Control carrier
identified  successful subsystem.hello
ready       valid subsystem.status(ready)
stopping    Main shutdown intent
stopped     Supervisor actual termination
failed      Control/Runtime failure classification
```

module path/PID/Worker handle不是 protocol identity。

---

## 9. Bootstrap Failure

以下任一使 required Runtime bootstrap失败：

```text
Runner creation failure
Definition Module load/ABI failure
Control carrier/hello failure
Runtime cannot become ready
unexpected Runtime termination
```

Phase 1 all-required → whole Game Bootstrap失败并统一 cleanup。Platform MUST NOT automatic restart。

---

## 10. Renderer / Data Bootstrap

Renderer与 DataAuthority流程保持独立：

```text
Main Renderer intent
→ Platform RendererHosting
→ Renderer Control
→ hello + full current Authority Snapshot
```

Main发布 `DataAuthority(S,G,P)` 后，Platform DataConnectionBroker再建立 matching physical endpoints。

Runtime ready不等待 Data offer。

---

## 11. Hostra Late Data Provisioning

```text
Broker
→ Host-owned Runner Provisioning IPC
→ one-time endpoint/ticket for S/G/P
→ Runner establishes Data WebSocket
→ SubsystemDataBinding
```

Provisioning不是 Runtime Control。

---

## 12. PWA Late Data Provisioning

```text
Broker creates MessageChannel
→ transfer Renderer endpoint
→ transfer Subsystem endpoint through Worker provisioning path
→ role-local bindings install current carrier
```

Port transfer是 Platform mechanism；application unit仍为 JSON text string。

---

## 13. Data Reconnect / Frame Independence

same S/G/P MAY获得 fresh carrier；fresh Data child state重新 baseline。

Data reconnect不重建 business capability、Runtime或 Frame authority。

Initial Frame仍由 Main分配/initialize/activate并在 ACK后发布 InputTarget；Data current不是 Frame activate前置条件。

---

## 14. Shutdown

```text
Main shutdown intent
→ subsystem.shutdown
→ SDK aborts scoped signals / bounded cleanup
→ Platform terminate Runner if needed
→ Supervisor observes actual termination
→ stopped
```

Runtime fatal则走 failure terminal path。

---

## 15. Recommended Session Sequence

```text
1  read/validate Game Entry
2  select current Platform
3  read/validate Platform Launch Manifest
4  exact key-set join
5  resolve all required executable bindings
6  freeze PlatformLaunchPlan
7  create logical Session
8  initialize Platform facilities
9  create Launch Attempts/tokens
10 RuntimeHosting launches required Runners by key
11 Runners load planned Definitions / construct role ports
12 Runtime Control hello → identified → ready
13 realize Renderer / Control Snapshot
14 Main publishes DataAuthority by policy
15 Broker provisions Data carriers
16 Frame authority proceeds independently
17 shutdown/termination converges through Supervisor
```

---

## 16. Final Invariants

1. Game Package只声明 logical key/initial input；
2. executable binding由 current Platform Launch Manifest拥有；
3. complete PlatformLaunchPlan在 Runtime side effect前闭合；
4. Main launch只使用 subsystemKey；
5. launch != loaded != connected != identified != ready；
6. ready不要求/携带 Data；
7. Runtime identity由 hello key绑定；
8. stopped只来自 actual termination；
9. no automatic restart；
10. Data Broker负责 actual carrier而不拥有 G/P；
11. provisioning不污染 Runtime/Renderer Control；
12. Frame/Input/Render/Data lifecycles独立；
13. Hostra/PWA application trace语义等价，implementation artifact可不同。
