# ADR 0017：平台是系统级 Composition Boundary

> 状态：Accepted；由 [ADR 0019](./0019-platform-launch-manifest-boundary.md) 进一步闭合 Game→Platform executable binding边界  
> 日期：2026-08-19  
> 影响范围：Main、Renderer、Subsystem、Content、Runtime Hosting、Control/Data Binding、Desktop/PWA Composition、package architecture

## 背景

跨平台差异不只存在于 Transport，而涉及 Runtime/Renderer hosting、Control/Data binding、Content、bootstrap/provisioning与 physical lifecycle。因此 Platform必须是完整 physical Session composition boundary。

## 决策

> **Main、Renderer、Subsystem、Content保持 platform-neutral；Platform Composition负责把逻辑角色实现为当前平台完整 physical Session。**

```text
Platform-neutral roles
    Main / Renderer / Subsystem / Content
                  │
             Platform Ports
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
 Hostra Desktop            PWA
```

Platform不成为 application authority。

### Runtime Hosting / Runner

Platform负责 Runtime Container creation/supervision、Control binding、Runner bootstrap/provisioning。

ADR 0019补充：Platform现在还明确拥有当前平台 executable binding与 preflight LaunchPlan；Main只发 `launch(subsystemKey)`。

### Data Broker

Data carrier建立属于 system-level Broker；Broker绑定 current Session/Renderer/S/G/P但不 mint generation/profile。

### Hostra/PWA realization

Hostra可使用 Node/WS/IPC/HTTP；PWA可使用 Worker/MessagePort/MessageChannel/SW。Physical topology不同，application contracts/authority/order/recovery等价。

### Business portability

业务 package只依赖 role SDK。ADR 0019修正“必须同一 Definition Module artifact”的旧表述：业务 source/ABI/semantics必须 platform-neutral，但 Hostra/PWA可以由各自 launch manifest选择不同 build artifact。

### Package boundary

Platform Architecture不自动产生 platform mega-package；ADR 0019允许抽两个窄 Runtime launch capability：

```text
@loomrealm/game-launcher-hostra
@loomrealm/game-launcher-pwa
```

完整 platform composition仍在 `apps/desktop` / `apps/pwa`。

## 结果

```text
Game logical topology
→ Platform launch plan
→ RuntimeHosting/Runner
→ role-facing ports
→ platform-neutral roles/business
```

新增平台应优先新增自己的 launch profile/realization，而不是扩张 Game common manifest。
