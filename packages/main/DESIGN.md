# `@loomrealm/main`

> 状态：Scaffold Only / M5 Implementation Not Started  
> 阶段：Package bootstrap  
> 最近复核：2026-08-28  

`@loomrealm/main` 是 LoomRealm Main role 的目标 package boundary。本目录当前只建立 npm workspace、TypeScript build、public entrypoint 与 package-level CI 的空项目骨架。

当前事实：

```text
package exists
buildable
packable
public runtime API = none
M5 implementation = not started
```

本 scaffold **不**实现，也**不**提前冻结：

```text
LogicalGameBootstrap
Subsystem Registry
Runtime Registry / Launch Attempt
bootstrap credential authority
Frame / Activation Registry
Stack mutation coordinator
InputTarget
failure classifier / fixed-point unwind
Runtime Control Main-side consumer mapping
Renderer Control authority/revision behavior
```

这些能力必须在 M5 implementation 中依据正式契约与真实 consumer 逐项落地；当前不得以 placeholder、throw-not-implemented、fake state machine 或未来接口占位制造虚假成熟度。

依赖也保持为空。实际 runtime dependencies 只在 M5 代码出现真实需要时加入，避免 package scaffold 预先决定协议、Platform 或 implementation ownership。

当前唯一 public module：

```text
@loomrealm/main
    (no exported runtime symbols)
```

因此允许声明：

```text
@loomrealm/main package scaffold created
```

不得声明：

```text
Main Core Implemented
M5 closed
LogicalGameBootstrap implemented
Main Runtime/Frame authority implemented
```
