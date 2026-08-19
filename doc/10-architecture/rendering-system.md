# 渲染系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Subsystem-owned Render Domain、Renderer authoritative replica、presentation、Data/Frame independence 与 Input boundary  
> 依赖：[系统架构总览](./system-overview.md)、[通信系统](./communication-system.md)  
> 被以下文档使用：[Subsystem 模型](./subsystem-model.md)、[运行时启动系统](./runtime-bootstrap-system.md)  
> 正式化：[Render Update v1](../15-contracts/render-update-v1.md)、[Renderer Data Profile v1](../15-contracts/renderer-data-profile-v1.md)  
> 最近复核：2026-08-19

---

## 1. Goal

```text
Subsystem business state
→ declarative Render Domain desired state
→ Render Update
→ Renderer Domain Store
→ local presentation
```

Render协议复制 authoritative presentation state，不把 Renderer变成 business authority，也不把 DOM/Canvas/WebGL命令暴露给 Subsystem。

---

## 2. Authority

Subsystem拥有：

```text
Render Domain lifecycle
Domain zIndex
Render tree authoritative state
Domain revision/publication intent
transient Render Event source
```

Renderer拥有：

```text
replica Store
local component/presentation mapping
DOM/Canvas/WebGL resources
paint/frame scheduling
```

Main不拥有 Render Domain state。

---

## 3. Domain Model

一个 Runtime：

```text
0..N Render Domains
```

每个 Domain：

```text
domainId one-shot lifecycle identity
zIndex
0..N ordered roots
recursive keyed nodes
independent revision
```

Domain不是 Frame；同一个 Domain可以服务多个 Frame，也可以在 zero active Frame时继续存在。

---

## 4. Render Update Model

当前消息：

```text
render.domains
render.snapshot
render.patch
render.event
```

```text
Registry  → Domain lifecycle authority
Snapshot  → full authoritative baseline/commit
Patch     → strict revision incremental commit
Event     → transient presentation impulse
```

Renderer必须原子应用 authoritative commit，不暴露半更新 tree。

---

## 5. Data Profile / Carrier

Render Update运行在：

```text
loomrealm.renderer-data/1
```

当前 Profile静态绑定 Render Update v1。

```text
DataPlane single dispatcher
→ render.* messages
→ Render Store
```

Render implementation不得自己竞争读取 raw Data carrier。

---

## 6. Fresh Data Carrier

fresh current Data carrier是新的 Render publication baseline：

```text
first Render message = current render.domains
→ fresh render.snapshot each current Domain
→ later patch/event
```

旧 carrier的 sender cursor/Renderer patch base不能继承为 fresh carrier authority。

但：

```text
fresh carrier != new Domain lifecycle
```

同一 authoritative Domain可跨 carrier继续存在。

---

## 7. Frame Independence

禁止隐式关系：

```text
Frame create  → create Domain
Frame active  → show Domain
Frame suspend → hide Domain
Frame close   → destroy Domain
```

如果业务希望某 Domain与某 Frame同生共死，应由 business/SDK local ownership policy显式 `close()`，不能把它升级成 protocol semantics。

---

## 8. Data Independence

```text
Data carrier retired
    → Render transport replica path interrupted
    ↛ authoritative Domain destroyed
```

Renderer MAY暂存最后合法 presentation，但 fresh carrier后 authoritative baseline必须来自新 Registry+Snapshot，而不是旧 cache推导。

---

## 9. Runtime Independence

Render Domain属于 Subsystem Runtime业务 state的一部分，但 Frame与Data不拥有其 lifecycle。

Runtime terminal最终会释放本 Runtime所有本地 Domain/resource；这是 Runtime resource cleanup，不表示 `frame.close` 或 `data.retire`拥有 Domain lifecycle。

---

## 10. Node Identity

Render node `key` 是 Domain-wide logical identity；同一 Domain lifecycle内 one-shot。

```text
removed published key
→ same key cannot represent later new node lifetime
```

live key保持 stable `tag`。

这防止 Renderer把旧 component/local state错误绑定到新的 logical node lifetime。

---

## 11. Presentation Mapping

`tag` 是 opaque string。

Render Core不定义：

```text
known component registry
component module loading
DOM tag semantics
Canvas/WebGL object model
unknown-tag application error
```

Renderer product/implementation决定如何解释 presentation tag；这不改变 authoritative Render Store validity。

---

## 12. Resource References

Render data只携 logical resource references；不携：

```text
filesystem path
Content bearer
absolute local URL
resource bytes
```

Renderer Resource Client通过 Content API解析资源。

---

## 13. Event Boundary

Render Event：

```text
ordered
transient
non-authoritative
no replay
may be lost
```

不能作为 persistent correctness唯一来源。

Event只针对 current committed target node lifetime；target不存在则 drop。

---

## 14. Input Boundary

Render focus/component存在不能创造 User Input authority。

User Input ordinary gate仍是：

```text
Main InputTarget(S,F,A)
∩ Interest[F]
∩ Producer(C)
∩ current matching Data connection
```

Renderer presentation MAY作为某个 Producer实现的输入源，但 Render Domain本身不拥有 InputTarget。

---

## 15. Cross-platform Presentation

Hostra/PWA共享相同 Render Update authoritative model。

允许不同：

```text
DOM implementation
Canvas/WebGL implementation
resource cache
paint cadence
browser capability
```

必须相同：

```text
Domain identity/lifecycle
revision/commit semantics
fresh carrier baseline
Event ordering/loss semantics
Frame/Data independence
```

---

## 16. Final Invariants

1. Render Domain authority在 Subsystem；
2. Renderer只维护 authoritative replica + local presentation；
3. Main/Frame不拥有 Render lifecycle；
4. Data Profile v1承载 Render Update v1；
5. fresh carrier用 Registry + fresh Snapshots重建 baseline；
6. fresh carrier不创建新 Domain lifecycle；
7. Frame close/suspend不隐式 destroy/hide Domain；
8. Data retire不 destroy authoritative Domain；
9. node key在 Domain lifecycle内 one-shot；
10. tag是 opaque presentation identifier；
11. Render Event transient/no replay；
12. Render state不携 physical resource capability；
13. Render/presentation不能生成 Main InputTarget。