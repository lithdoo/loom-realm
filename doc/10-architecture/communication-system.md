# 通信系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving；Viewport 为待签署、未实施的 Profile /1 修订目标  
> 主要定义：Control Plane、Renderer Data Plane、Content Plane、carrier/application mapping、authority/recovery 与 Platform responsibilities  
> 依赖：[系统架构总览](./system-overview.md)、[平台组合系统](./platform-composition-system.md)、[运行承载系统](./runtime-hosting-system.md)  
> 被以下文档细化：[渲染系统](./rendering-system.md)、[Subsystem 模型](./subsystem-model.md)、[运行时启动系统](./runtime-bootstrap-system.md)  
> 正式化：[Renderer Data Profile v1](../15-contracts/renderer-data-profile-v1.md)、[Viewport State v1](../15-contracts/viewport-state-v1.md)；签署状态以[冻结账本](../30-implementation/viewport-core-freeze-ledger.md)为准。  
> 最近复核：2026-09-18

---

## 1. 三类通信平面

```text
Control Plane
    Main ⇄ Subsystem
        Subsystem Control v1
        Frame / Call v1
        Runtime Control Profile v1
    Main ⇄ Renderer
        Renderer Control v1

Renderer Data Plane
    Renderer ⇄ Subsystem
        Renderer Data Application Profile /1（本次修订目标）
            Data Connection v1
            User Input v1
            Render Update v1
            Viewport State v1

Content Plane
    Main/Renderer/Subsystem ⇄ Readonly Content Service
```

这些平面共享某些 transport primitives，但 authority/lifecycle/recovery 完全独立。Viewport 属于现有 Data Plane 的独立 child，不是第四个通信平面，不属于 Input 的 `x.*`。

---

## 2. MessageCarrier Boundary

所有 message-oriented Control/Data role implementation 消费 `MessageCarrier`。Carrier 只保证 message boundary、per-direction order、observable close/loss、production adapter avoids unbounded physical buffering（threshold/config 不属于 Foundation contract）、no adapter-created duplicate/retry。

Carrier 不定义 connection identity、establishment、reconnect policy、Runtime failure、Data generation/profile；Viewport 不改变 Carrier 接口或建立第二条连接。

---

## 3. Unified Application Unit

当前 Runtime Control / Renderer Control / Renderer Data Profile 统一：one carrier application unit = one UTF-8 JSON text string。WebSocket = one text message；MessagePort = `postMessage(string)`；MemoryCarrier = string。Structured Clone 仅用于 Platform bootstrap/Port transfer；application payload 不允许出现第二套 structured-object model。Viewport 遵循相同的 common 1MiB/depth64 与 Wire preflight，不增加专用编码。

---

## 4. Main ⇄ Subsystem Control

同一 current Control Connection 承载 Subsystem Control + Frame / Call，由 one connection-wide dispatcher 消费；same sender 共享 Request ID namespace。Control loss 在无 shutdown intent 时 Runtime-fatal；same-attempt 无 reconnect。Platform 只建立 carrier，不改变 hello/Frame transaction semantics。

---

## 5. Main ⇄ Renderer Control

Renderer Control 只发布 Main committed logical authority：Runtime projection、Frame Stack / Activation、InputTarget、DataAuthority `{subsystemKey,generation,dataProfile}`。不携 Data endpoint/ticket/Port、Interest Registry、Render State、Viewport width/height 或 Content credential。Control loss 使 Renderer 失去 current Main authority，并 retire 旧 Data connections；不得以 Main 作为 Viewport size mirror。

---

## 6. Renderer Data Application Profile

首次发布前的获授权修订目标：

```text
loomrealm.renderer-data/1
= Connection 1 + User Input 1 + Render Update 1 + Viewport State 1
```

旧 executable 仍是三 child，不得以修订后的文档冒充已实现；旧、新 `/1` binaries 不互通，必须同一部署构建批次整体协调升级。此决策见 [ADR0036](../decisions/0036-preimplementation-viewport-profile-v1-correction.md)，正式冻结另受账本 gate 控制。

Profile 负责 child protocol version binding、JSON text mapping、single connection-wide Data dispatcher、`input.*` / `render.*` / `viewport.state` exact demux、single serialized writer、fresh-carrier 各 child 独立 baseline 与 Data-local terminal。Connection Core 本身 zero application messages。Viewport width/height 由 Renderer 的平台注入 source 提供；经 Data peer 到 Subsystem Runtime-scoped retained read-only `scope.viewport`，不走 InputTarget/Activation/Frame gate，不修改 RenderDomain/Store/Projector。

---

## 7. Data Connection Authority

Main DataAuthority：S = subsystemKey，G = generation，P = dataProfile。Platform Broker 依据 current `S/G/P` 建立物理两端；`DataAuthority exists != carrier exists`，`carrier exists != current authority`。Current gate 至少匹配 Session、current Renderer、S、G、P。

同 generation/profile 顺序 reconnect 允许；**Profile identity 改变**仍必须 fresh generation。本次整体预发布修订沿用相同 identity，但禁止旧、新 binary 混连，不能依赖 `S/G/P` 自行识别 binary 版本。

---

## 8. Dynamic Provisioning

已经运行的 Subsystem Runtime 需要后续取得 Data carrier：Main DataAuthority → Platform DataConnectionBroker → platform-local provisioning → role-local DataBinding → DataPlane installs current carrier。

Hostra：Runner IPC/equivalent + endpoint/ticket + WebSocket；PWA：Worker provisioning path + transferred MessagePort。Provisioning material 不进入 Runtime Control / Renderer Control / business payload。Viewport 不增加 provisioning API。

---

## 9. Data Failure Boundary

Data carrier loss、provisioning failure、unsupported dataProfile、same-generation reconnect failure 都不自动 fail Runtime、unwind Frame 或 change Main DataAuthority。Data current→retired；仍授权时可以 later fresh carrier。Viewport Runtime 保留最后合法尺寸但不声明其当前可绘制；fresh peer 必须从 current source 重新 baseline。

---

## 10. User Input Cross-plane Composition

```text
Effective(F,A,C)
= current matching Data S/G/P
∧ Main InputTarget == (S,F,A)
∧ mirrored/local F active/current A
∧ C ∈ Interest[F]
∧ Producer(C) available
```

Renderer Control 与 Data Connection 无跨连接 total order。Interest first → inert until authority；Authority first → no send until Interest。不建立 cross-plane ACK/revision join/barrier。Viewport 独立于这个输入有效性公式；无 InputTarget 时仍可报告逻辑呈现尺寸，但不能凭观察获得 Frame mutation permit。

---

## 11. Render Communication

Render Update 方向 Subsystem → Renderer。Fresh Data carrier：`render.domains` → fresh snapshots → patch/event。Data carrier loss 只丢 replica transport baseline，不销毁 Subsystem authoritative Domain。Viewport 不替代 Render publication，不在尺寸消息中携带 Map/Camera/Sprite 或修改 M13 projection。

---

## 12. Content Plane

Content 使用 HTTP/Fetch logical API，而不是 MessageCarrier 协议。Desktop → localhost HTTP；PWA → same-origin Fetch/SW。Content credential/bootstrap mechanism 属于 Platform implementation；logical route/cache/error/integrity 由 Content API 定义。

---

## 13. Backpressure

所有 plane 必须 bounded，policy 由对应协议域负责：Renderer Control → latest full snapshot；User Input → state coalesce + bounded event queue；Render Update → protocol revision/commit rules；Viewport State → **每 peer 一个已 admission/in-flight + 一个未 admission latest pending**；Content → HTTP request/concurrency policy。

Viewport 不能将每个 resize 先提交共享 writer 再去重；详细 A→B→A 状态机唯一来源为 [Viewport State v1 §4](../15-contracts/viewport-state-v1.md)。现有 writer 的 1024 capacity 是实现事实，不是协议通用值。Transport 不得为缓解 backpressure 重试/duplicate application mutation。

---

## 14. No Cross-plane Global Order

不存在整个 LoomRealm Session 的单一 network sequence。只依赖 per-connection per-direction order、protocol-defined causal barriers、current authority conjunction。Runtime Control ↛ total order with Renderer Control；Renderer Control ↛ total order with Data；Input/Render/Viewport 共享 writer FIFO，但不共享 revision、transaction、ACK 或跨 child baseline barrier。

---

## 15. Final Invariants

1. Control/Data/Content 是独立通信平面；current message-oriented profiles 统一 UTF-8 JSON text string。
2. Carrier 只描述已建立 pipe，不描述 authority/establishment；Runtime Control 使用 one dispatcher + shared sender ID namespace。
3. Renderer Control 只复制 logical authority；DataAuthority = S/G/dataProfile，不携物理 material 或 width/height。
4. Renderer Data Profile /1 的修订目标静态绑定 Connection/Input/Render/Viewport v1；旧 executable 不因文档改变而已实现。
5. Data Broker/provisioning 属于 Platform；Data provisioning/loss 不等于 Runtime failure；Control/Data 无跨连接 total order。
6. User Input 使用 authority×Interest×Producer 交集；Viewport 不经过此交集也不授予 Frame mutation。
7. Render/Data/Frame lifecycles 相互独立；Viewport 不写 RenderDomain/Store/Projector。
8. Transport Adapter 不拥有 application retry/recovery；新旧 `/1` binary 不得混连。
