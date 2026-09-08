# Hostra Desktop Composition 设计

> 层级：模块设计  
> 状态：M6 Runtime / M9 Data / M12 Content **Implemented + Qualified**；M13 Web Presentation / M15 Full E2E Planned  
> 依赖：[平台组合系统](../../10-architecture/platform-composition-system.md)、[渲染系统](../../10-architecture/rendering-system.md)、[Content API v1](../../15-contracts/content-api-v1.md)、[Web Presentation Config v1](../../15-contracts/web-presentation-config-v1.md)、[Web Presentation API v1](../../15-contracts/web-presentation-api-v1.md)、[ADR 0031](../../decisions/0031-business-owned-web-component-projection.md)  
> 最近复核：2026-09-08

Hostra只拥有 physical topology/composition；Main保留 Session/Runtime/Frame/Activation/InputTarget/DataAuthority authority，Subsystem保留 business Render authority。

---

## 1. Milestone Shape

```text
M6  Hostra PREPARE / Runner / Runtime Control         ✅
M9  Desktop Data Broker / child provisioning         ✅
M10 User Input                                       ✅
M11 Render Replication                               ✅
M12 Desktop Content                                  ✅
M13 Web Presentation                                 pending
M14 loom.map + map-owned WC                          pending
M15 BrowserWindow/full Desktop E2E                    pending
```

M15只完成真实 Desktop physical composition，不重新设计 M9–M13 logical semantics。

---

## 2. Runtime PREPARE / Presentation Input

Hostra Runtime PREPARE继续：

```text
HostraPlatform.prepareGame
→ game-launcher-hostra
→ Game Entry + launch.hostra.json validation/join
→ executable/security preflight
→ immutable HostraLaunchPlan
→ LogicalGameBootstrap
```

Web presentation是独立 product startup input，但 Config acquisition mechanics属于 Desktop private composition：

```text
installationRoot
+
user-selected Desktop-private config source/path
→ read / parse candidate JSON
→ WebPresentationConfigV1
```

filesystem path只是一种 Desktop acquisition mechanism，不是 `WebPresentationConfigV1` 字段或跨平台 ABI。Presentation Config不进入 Game Entry、Hostra manifest、Runtime executable join或 Main bootstrap。

---

## 3. Existing Physical Slices

### M9 Data

Data Broker负责 paired current Renderer/Runner carrier；Data ticket/provisioning IPC不能作为 Content或JS/CSS loader channel。

### M12 Content

```text
successful Hostra PREPARE
→ prepared installation
→ exactly one direct-child [FSDB]*
→ readonly Content view/service
```

Subsystem获得 bound ContentClient；Renderer获得 trusted/private ResourceClient。Desktop不新增独立 `fsdbRoot` 用户配置。

---

## 4. M13 Browser Bootstrap

精确规则由 [Web Presentation Config v1](../../15-contracts/web-presentation-config-v1.md) 拥有：

```text
Desktop-private config acquisition
→ WebPresentationConfigV1
→ current prepared Content refs
→ ordered <link rel="stylesheet">
→ ordered classic <script>
→ business customElements.define(...)
→ window.onload
→ start Web Projector
```

Desktop负责 trusted prepared resource → browser `href/src` 的 private binding，并必须独立检测 stylesheet/script load/evaluation failure。

Business config/WC不得观察 path、bearer、FSDB或 privileged localhost URL。

---

## 5. M13 Projector Integration

```text
M11 Store successful commit
→ package-private post-commit seam
→ presentation eligibility/currentness gate
→ Web Projector
→ document.body / business-owned WC
```

Desktop实现必须服从 Rendering System：

```text
same live wire-node identity
(Session, subsystemKey, generation, domainId, key)
→ same HTMLElement

managed root order
→ subsystemKey UTF-8 lexical
→ within subsystem: M11 zIndex/domainId order
→ roots order
```

不得以裸 `Map<key, HTMLElement>` 实现 Window-global identity，也不得把 zIndex升级成 cross-Subsystem global stacking authority。

same-generation carrier loss必须保留最后 committed managed DOM mounted，并冻结 Projector mutation；replacement carrier只有在 fresh Registry + every current Domain fresh baseline 完整后才 reconcile。partial rebaseline不得泄漏到 DOM。fresh generation才 retire旧 managed elements并创建 fresh HTMLElement identity universe。

Actual layout/stacking由 business WC/CSS负责；Desktop不建立 per-Domain layer/framework。

---

## 6. Web Presentation API Integration

精确 local ABI由 [Web Presentation API v1](../../15-contracts/web-presentation-api-v1.md) 拥有。

Desktop/Renderer必须提供：

```text
receiveRenderContext before first managed insertion; at most once per HTMLElement
receiveRenderData for current retained full data
same-generation carrier loss causes no receiver or LoomRealm detach/reinsert
complete rebaseline before reconnect reconciliation
PresentationResourceClient façade over M12 private ResourceClient
```

Business WC runtime resource只使用 logical namespace/key/expectedContentVersion，不能获得 Content origin/token/path/FSDB/private Renderer client。

Config bootstrap resource binding与runtime PresentationResourceClient是不同 capability boundary。

---

## 7. Failure / Lifetime

Bootstrap failure阻止 Projector进入 running state。Runtime WC/resource/DOM failure是 presentation-local：

```text
no Store rollback
no Main/Subsystem authority mutation
no automatic Runtime/Frame failure
```

Presentation bootstrap/context lifetime与 Renderer Window environment对齐；不按 Subsystem/Frame/Domain/Data reconnect动态装卸 scripts/styles或重建 capability。

same-generation Data currentness loss只冻结 projection，不结束 Window-lifetime context capability或仍 live element identity；fresh generation结束旧 wire-node/HTMLElement identity universe。

---

## 8. Qualification

M13 real Chromium至少覆盖：

```text
ordered bootstrap + explicit resource failure detection
window.onload start barrier
Custom Element registration
successful Store commit → Projector
scoped wire-node identity / no key collision
same-generation carrier loss keeps DOM mounted and fires no receiver/disconnect/reconnect
partial same-generation rebaseline does not mutate DOM
complete same-generation rebaseline preserves matching HTMLElement identity
fresh generation gets fresh HTMLElement identity
subsystemKey → M11 domain order → roots
reorder moves existing elements
context/data receiver lifecycle
real PresentationResourceClient → M12 bytes
version conflict/cancellation/value ownership
no credential/path/private-client exposure
failure never rolls back authority
```

M15再覆盖完整 BrowserWindow + Renderer Control + Data Broker + physical input + M14 map + reconnect/reload/shutdown trace。

---

## 9. Final Invariants

1. Hostra Launcher只拥有 Runtime executable PREPARE；presentation startup独立；
2. Main不接收 plan/path/token/presentation config；
3. Config source/path acquisition属于 Desktop private composition，不属于 Config v1；
4. Data provisioning、Content credential、presentation bootstrap不混成万能 channel；
5. Desktop只实现 M13 formal Config/API/identity/currentness/order semantics，不新增平台专属 variant；
6. Business WC只读 LoomRealm projection并只通过 narrow PresentationResourceClient读取runtime resource；
7. Desktop不建立 component registry、AssetManager、dynamic loader、global layer manager或 second projection authority。
