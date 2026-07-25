# 第一阶段 Web Client 状态协调与 DOM 呈现

> 状态：**Active Design**  
> 适用范围：第一阶段 Web Client  
> 最近复核：2026-07-25  
> 主要定义：Client Store、Scope Tree 协调、节点注册、资源缓存和本地表现状态

相关文档：

- [`../architecture/client-state-tree-protocol.md`](../architecture/client-state-tree-protocol.md)：Client State、Scope 和 Client Node 的规范结构；
- [`../architecture/client-state-projector.md`](../architecture/client-state-projector.md)：服务端如何生成 Client State；
- [`../architecture/runtime-rpc-and-state-sync.md`](../architecture/runtime-rpc-and-state-sync.md)：状态消息、Sequence、事件和恢复；
- [`../runtime/phase-1-pokemon-essentials-map-runtime.md`](../runtime/phase-1-pokemon-essentials-map-runtime.md)：地图兼容、标准渲染项和资源 Key。

核心原则：

> Runtime 决定游戏状态，Client State 描述客户端目标树，Web Client 将目标树协调为 DOM；DOM 和动画都不是权威游戏状态来源。

## 1. 模块位置

```text
Runtime Service
    ↓ state.snapshot / scope.replace / event
Client Store
    ↓ validated Client State
Scope Tree Reconciler
    ↓ keyed node operations
Custom Node Registry
    ↓ create / update / destroy
DOM / CSS

Client Node resource key
    ↓
Resource Cache
    ↓
Runtime Service Resource Endpoint
```

## 2. Web Client 职责

Web Client 负责：

- 建立和维护 Runtime RPC 连接；
- 验证协议版本、消息 Sequence 和状态 Revision；
- 保存独立于 DOM 的 Client Store；
- 原子应用完整状态或单 Scope 替换；
- 按 Scope 和稳定 Key 协调节点树；
- 通过注册 Tag 选择可信节点实现；
- 校验节点 Data Schema；
- 按资源 Key 请求、解码和缓存图片；
- 管理动画、过渡和资源加载等非权威本地状态；
- 将键盘、手柄和节点事件归一化为协议输入；
- 在状态基础不确定时请求完整恢复。

Web Client 不负责：

- 读取游戏包或 FSDB；
- 解析 Pokémon Essentials 原始 Tile ID、passage flags 或 Ruby 数据；
- 判断碰撞、Portal 或地图切换结果；
- 直接修改 Runtime 权威状态；
- 执行服务端下发的任意 JavaScript、HTML 或 CSS；
- 把 DOM 当作游戏状态数据库；
- 依赖 Electron 才能运行。

## 3. Client Store

Client Store 是客户端状态的唯一内存镜像：

```ts
interface ClientStore {
  readonly state: ClientState | null;
  readonly lastSequence: number;
}
```

消息处理顺序：

```text
Runtime Message
→ 验证协议版本
→ 验证 Sequence
→ 验证 Client State / Scope Revision
→ 验证 Scope Tree
→ 计算完整的 Next Client Store
→ 一次性提交 Store
→ 协调受影响 Scope 的 DOM
```

传输回调不得直接散布 DOM 修改逻辑。

## 4. 完整状态应用

收到 `state.snapshot` 时：

1. 验证整个 `ClientState`；
2. 验证每个 Scope 的 Key 唯一性、Tag 和 Data；
3. 将旧 Store 与新状态进行比较；
4. 一次性替换 Store 中的 Client State；
5. 删除不再存在的 Scope；
6. 协调所有新增或变化 Scope；
7. 更新 `lastSequence`。

完整状态适用于：

- 首次连接；
- 页面重新加载；
- 重新连接；
- Sequence 或 Revision 出现缺口；
- 客户端验证失败后的恢复；
- 多 Scope 原子变化；
- 地图切换提交。

客户端不得在完整状态只应用了一部分时向用户暴露新场景。

## 5. 单 Scope 替换

收到 `scope.replace` 时：

```text
value = ClientScope
→ 替换该 Scope 的目标 Roots Tree

value = null
→ 删除该 Scope 及其 DOM 节点
```

应用前必须验证：

- 消息 Sequence 连续；
- `stateRevision` 是可接受的新版本；
- Scope Revision 不倒退；
- Scope Tree 结构有效；
- 所有 Tag 已注册；
- Data 满足对应 Schema。

任一条件无法确认时，不继续应用局部更新，改为请求 `state.snapshot`。

## 6. Scope 挂载

每个 Scope 对应一个由客户端应用拥有的挂载容器，例如：

```html
<div data-lr-scope="world"></div>
<div data-lr-scope="overlay"></div>
```

挂载容器不属于同步树。

规则：

- Scope 名称由业务注册，不由基础协议固定；
- `roots[]` 的顺序决定容器直接子节点顺序；
- 空 Scope `roots: []` 表示 Scope 存在但没有节点；
- 删除 Scope 使用 `value: null`；
- 多个 Scope 的布局层级由客户端应用外壳决定。

## 7. Keyed Tree Reconciliation

`ClientNode.key` 在一个 Scope 内全局唯一。客户端使用：

```text
scope + key
```

定位节点实例。

协调算法至少需要支持：

- 创建新节点；
- 更新相同 Key 和相同 Tag 的节点；
- 当 Key 相同但 Tag 改变时销毁旧节点并创建新节点；
- 移动节点到新的父节点或顺序位置；
- 删除不再存在的节点；
- 保留未变化节点的 Element 和本地资源引用；
- 在 Scope 删除时递归清理全部节点。

第一阶段不要求最小 DOM 操作数量，但不得在普通人物移动时无条件重建整张地图。

## 8. Custom Node Registry

基础客户端只解释协议结构。具体业务节点通过注册表扩展：

```ts
interface ClientNodeRenderer {
  create(node: ClientNode, context: NodeContext): Element;

  update(
    element: Element,
    previous: ClientNode,
    next: ClientNode,
    context: NodeContext,
  ): void;

  destroy?(
    element: Element,
    node: ClientNode,
    context: NodeContext,
  ): void;
}
```

注册：

```ts
registry.register("lr-map", mapRenderer, mapDataSchema);
registry.register("lr-actor", actorRenderer, actorDataSchema);
registry.register("lr-loading", loadingRenderer, loadingDataSchema);
```

规则：

- Tag 必须预先注册；
- 一个 Tag 对应一个节点实现和 Data Schema；
- 未注册 Tag 是协议或部署错误；
- Data 只允许合法 JSON 值；
- 节点实现不能任意修改其他 Scope；
- 服务端不能通过 Tag 或 Data 下发可执行代码；
- 节点销毁时必须释放事件监听、动画和资源引用。

## 9. DOM 映射

第一阶段冻结：

1. 一个 `ClientNode` 对应一个 DOM `Element`；
2. `tag` 决定节点实现；
3. `key` 决定节点身份和复用；
4. `data` 更新节点自身状态；
5. `children` 决定直接子 Element；
6. `roots` 决定 Scope 容器的直接子 Element。

复杂节点可以内部使用 Shadow DOM，但协议只管理外层自定义 Element。

## 10. 状态、资源和表现分离

Web Client 维护三类数据：

### 10.1 Client State 镜像

来自 Runtime Service 的目标状态，例如：

- 当前地图节点；
- 玩家逻辑位置和移动状态；
- HUD、Loading 和错误节点；
- 稳定资源 Key。

它是客户端可恢复状态，但不是游戏规则权威来源。

### 10.2 Resource Cache

保存：

- 已请求图片；
- 解码结果；
- 资源请求状态；
- 可丢弃的切片或样式缓存。

资源缓存随时可以重建，不进入 Client State Revision。

### 10.3 Local Presentation State

只影响表现：

- 人物格子间的像素插值；
- 当前动画帧；
- CSS Transition 或 Web Animations 状态；
- 场景遮罩；
- 图片加载占位；
- 调试开关。

本地表现状态不得改变人物逻辑位置、碰撞结果或 Portal 结果。

## 11. 地图与人物节点

地图兼容编译层输出标准渲染数据。Web Client 不解释原始 RPG Maker XP Tile ID。

概念节点树可以是：

```text
world Scope
├── lr-map
│   ├── lr-tile-layer
│   └── lr-world-layer
│       ├── lr-priority-tile
│       └── lr-actor
└── lr-debug-layer
```

这只是业务注册示例，不属于基础协议固定 Schema。

地图节点 Data 可以引用：

- 地图宽高和 Tile 尺寸；
- 已标准化的渲染项；
- 图片资源 Key；
- 图片源矩形；
- 渲染平面和排序值；
- 内容版本。

人物节点 Data 可以引用：

- 稳定人物 Key；
- Sprite 资源 Key；
- 帧布局；
- 逻辑起点和终点；
- 移动时长或逻辑进度；
- 朝向。

图片字节不进入节点 Data。

## 12. 人物移动表现

Runtime Core 决定人物是否移动以及移动的权威起点、终点和完成结果。

```text
权威移动状态
→ Client State Node Data
→ Actor Renderer
→ 根据格子坐标计算像素位置
→ CSS Transform 或 Web Animations 表现
```

客户端不得：

- 使用 `offsetLeft`、`offsetTop` 或当前 Transform 作为权威位置；
- 根据 `transitionend` 决定移动是否完成；
- 因动画未结束而拒绝更新更高 Revision 的状态；
- 在 Runtime 判定阻挡时继续移动到目标格。

收到更新状态时，动画应对齐新的权威目标，而不是坚持播放过期轨迹。

## 13. 地图切换呈现

地图提交通过完整 `state.snapshot` 原子发布。

客户端流程：

```text
收到新 Client State Snapshot
→ 验证完整状态
→ 提交 Client Store
→ 协调新 World Scope
→ 请求缺失资源
→ 呈现新场景或占位状态
```

资源加载不阻塞 Runtime 恢复。客户端可以：

- 保持黑色遮罩直到关键图片就绪；
- 使用占位图；
- 在资源失败时显示客户端资源错误。

客户端不能向 Runtime 回报“DOM 已完成”作为地图逻辑提交条件。

## 14. Runtime Event

Runtime Event 用于一次性表现和通知，例如音效、短暂提示或诊断。

规则：

- Event 不写入 Client Store 的长期状态；
- Event 不参与 Scope Tree 合并；
- 需要重连后恢复的内容必须进入 Client State；
- 重复或过期 Sequence 的 Event 按 RPC 规则处理；
- Event 处理失败不能破坏 Client Store 的完整状态。

## 15. 输入和节点事件

Web Client 将原始浏览器输入归一化后发送：

- 键盘方向或手柄输入转换为游戏意图；
- 节点交互使用 Scope、Key、Event 和 Data；
- 不发送原始 DOM Event 对象；
- 不允许节点直接调用 Runtime 内部方法；
- 页面失焦或连接断开时释放持续输入状态。

节点事件必须来自当前 Client Store 中存在且允许该事件的节点。

## 16. 错误和恢复

以下情况停止应用局部状态并请求完整恢复：

- Sequence 缺口；
- State Revision 倒退或无法连续解释；
- Scope Revision 冲突；
- Scope 内重复 Key；
- Tag 未注册；
- Data Schema 不匹配；
- Tree 深度、节点数或消息大小超限；
- DOM 协调器出现无法隔离的结构错误。

恢复流程：

```text
停止应用局部消息
→ 保留最后一个完整 Client Store
→ 请求 state.snapshot
→ 验证并全量替换
→ 重建必要 Scope
```

如果完整状态仍无效，应显示明确故障并断开或停止当前会话呈现。

## 17. 安全边界

客户端必须：

- 只接受已注册 Tag；
- 校验 Data Schema；
- 不执行 Data 中的字符串；
- 不把未净化字符串写入 `innerHTML`；
- 不接受任意 `script`、`iframe` 或原生标签；
- 不根据服务端路径读取本地文件；
- 限制树深度、节点数和消息大小；
- 隔离节点实现对其他 Scope 的访问。

Hostra 环境下仍保持 `contextIsolation = true` 和 `nodeIntegration = false`。

## 18. 性能边界

第一阶段优先正确性、可检查性和稳定 Key 复用。

应做到：

- 地图静态节点建立后尽量保持稳定；
- 人物移动主要更新 Transform 和少量属性；
- 避免高频布局读取；
- 一个状态提交中的 DOM 修改集中执行；
- 不在每个动画帧重建 Client Tree；
- Resource Cache 对相同 Key 去重。

第一阶段不要求：

- 大地图虚拟化；
- Chunk 流式加载；
- Canvas 或 WebGL；
- 通用场景图；
- 多渲染后端。

## 19. 测试要求

至少覆盖：

1. 首次 Snapshot 建立 Client Store 和全部 Scope；
2. 单 Scope Replace 只协调目标 Scope；
3. Scope 删除清理全部节点；
4. 空 Scope 与删除 Scope 行为不同；
5. 相同 Key 和 Tag 复用 Element；
6. Key 相同但 Tag 改变时重建节点；
7. 节点移动到不同父级或顺序位置；
8. 未注册 Tag 被拒绝；
9. Data Schema 错误被拒绝；
10. Sequence 缺口触发 Resync；
11. 旧 Scope Revision 不覆盖新状态；
12. 地图切换 Snapshot 原子替换场景；
13. 普通人物移动不重建完整地图；
14. 动画结束不反向推进 Runtime；
15. 资源请求按 Key 去重；
16. 资源失败不修改权威 Client State；
17. 节点销毁释放监听和资源引用；
18. 浏览器和 Hostra 使用同一协调逻辑。

## 20. 第一阶段冻结决策

| 问题 | 第一阶段结论 |
|---|---|
| 客户端状态来源 | Client Store |
| DOM 状态来源 | Client State Tree + 本地表现状态 |
| Scope 更新 | 完整 Snapshot 或单 Scope Replace |
| 节点身份 | `scope + key` |
| 节点实现 | 预注册 Tag |
| Data | JSON + Tag Schema |
| DOM 映射 | 一个 ClientNode 对应一个 Element |
| 图片 | 资源接口按 Key 请求 |
| 动画 | 非权威本地状态 |
| 地图切换 | Snapshot 原子应用 |
| 状态不确定 | 请求完整 Resync |
| 原始 FSDB | Web Client 不读取 |
| 原始 Tile ID | Web Client 不解释 |
| 任意代码或 HTML 下发 | 禁止 |

## 21. 当前结论

```text
Runtime Service
→ Client Store
→ Scope Tree Reconciler
→ Custom Node Registry
→ DOM / CSS
```

Client Store 是 DOM 之前的稳定状态边界；Scope Tree Reconciler 负责按 Key 复用和清理节点；业务通过注册 Scope、Tag 和 Data Schema 扩展。资源缓存和动画可以独立演进，但不得成为权威游戏状态来源。