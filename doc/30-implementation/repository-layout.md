# 仓库与分包方案

> 层级：实施计划  
> 状态：Draft / Tracking  
> 稳定程度：Experimental  
> 主要定义：建议的代码分包、进程入口和依赖规则  
> 依赖：[模块设计目录](../20-modules/README.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-08-04

本方案用于指导第一阶段落地，不是产品协议。包名可以调整，但职责边界必须遵守上层架构和契约。

## 1. 建议工作区

```text
packages/
├── protocol-core/
├── subsystem-control-protocol/
├── frame-call-protocol/
├── renderer-subsystem-connection-protocol/
├── render-update-protocol/
├── user-input-protocol/
├── render-state-protocol/
├── content-api-contract/
├── game-package-contract-v2/
├── nodejs-launcher-profile-v1/
├── main-system/
├── subsystem-sdk/
├── web-renderer/
├── game-package/
├── fsdb-content-service/
├── map-subsystem/
├── map-content-profile-pe/
├── hostra-adapter/
├── pwa-host/
└── test-subsystems/
```

## 2. 协议 / 契约包

### `protocol-core`

提供 JSON Value、JSON-RPC Envelope、Schema 工具与公共错误形状。Subsystem Control 的 stable semantic code 仍由对应协议包拥有。

### `game-package-contract-v2`

实现已冻结 Descriptor / Entry / env / complete-set validation 与 conformance fixture。

### `nodejs-launcher-profile-v1`

实现 ResolvedLauncherTarget、Launch Attempt / Bootstrap Context、Entry containment、safe environment builder、spawn options、Process exit classification 与 launcher error categories。

### `subsystem-control-protocol`

**Active / Normative / Frozen v1**：

```text
subsystem.hello      Subsystem → Main Request
subsystem.status     Subsystem → Main Notification
subsystem.shutdown   Main → Subsystem Request
```

包提供 hello/status/shutdown Schema、identity/lifecycle state machine、semantic error helper、wire limits 与 conformance fixtures。

### `frame-call-protocol`

整体仍 Draft，但 **Batch A / B 已 Normative / Frozen**。

包现在可以立即实现稳定类型与 Schema：

```ts
type FrameLifecycleState =
  | "starting"
  | "active"
  | "suspended"
  | "closing"
  | "closed";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

type FrameOutcome =
  | { readonly type: "completed"; readonly value: JsonValue }
  | { readonly type: "cancelled" }
  | {
      readonly type: "failed";
      readonly error: {
        readonly code: string;
        readonly message?: string;
        readonly data?: JsonValue;
      };
    };
```

Batch B 冻结完整 RPC surface：

```text
Main → Subsystem
    frame.initialize({ frameId, input })
    frame.activate({ frameId, activationId })
    frame.suspend({ frameId, activationId })
    frame.resume({ frameId, activationId, returnedFrameId, result })
    frame.close({ frameId })

Subsystem → Main
    frame.call({ frameId, activationId, targetSubsystemKey, input })
        → { childFrameId }
    frame.return({ frameId, activationId, result })
        → {}
```

包必须同时实现：

- exact method-name / direction validator；
- closed params/result Schema；
- `FrameOutcome` discriminated union；
- `completed.value` REQUIRED，no-value = `null`；
- `frame.initialize` 无 `callerFrameId`；
- `frame.return` 无 Caller/receiver identity；
- Main→Subsystem RPC 无 source `systemId / subsystemKey`；
- `frame.close` 无 reason；
- `frame.resume` = Child Outcome delivery + replacement Activation；
- `frame.call` success 返回 `childFrameId`，但不是最终业务 result；
- structural schema failure → JSON-RPC `-32602`。

该包 MUST NOT 定义或接受：

```text
system.call
system.return
frame.ready
frame.status
frame.result
frame.cancel
frame.close(reason)
```

也不得重新定义 Runtime bootstrap / ready / shutdown / restart 或 Render State。

Batch C-F 只继续增加 transaction/error/failure/limits/profile 语义，不得改变 Batch A/B 已冻结字段。

### `renderer-subsystem-connection-protocol`

负责 Session / Subsystem / Connection identity、Grant auth、version/capability、heartbeat、reconnect/replace/close。这里的 heartbeat/reconnect 不得改写 Subsystem Control v1。

### `render-update-protocol`

负责 Subsystem-owned Render lifecycle、State/Event、Revision/ordering、recovery/resync、composition hooks，不使用 Frame Activation 作为 Render epoch。

### `user-input-protocol`

负责 Main-authorized `subsystem reference + frameId + activationId` 输入路由、active/current Activation 校验、stale Activation rejection、continuous/discrete/reset/UI Interaction/backpressure。

### `render-state-protocol`

负责声明式 Render Tree / Scope / Node schema；Render identity 最终字段仍待冻结。

### `content-api-contract`

负责逻辑只读 Content API route / response / error / cache / authorization。

## 3. `main-system`

实现 Descriptor/Launcher/Runtime Supervisor、Control Connection Registry、Frame Registry、Activation Registry、Frame Stack、Frame/Call Coordinator、Renderer Control Publisher 与 Data Connection Authority。

Frame Registry 必须分开保存：

```text
lifecycle
    starting / active / suspended / closing / closed

outcome
    null / completed / cancelled / failed

currentActivationId
    only non-null for active Frame

callerFrameId
    Main-owned immutable relationship
```

Batch B Adapter 必须只接受七个冻结方法和字段，不能为实现方便扩展 reason/metadata/Caller identity。

## 4. `subsystem-sdk`

至少提供：

- Bootstrap Context decoder；
- Subsystem Control v1 adapter；
- Frame RPC dispatcher/client；
- Frame Input Context Registry；
- System Data / Render / User Input adapters；
- Content Client。

Frame Adapter 应直接暴露 Batch B 稳定接口：

```text
onInitialize(frameId, input)
onActivate(frameId, activationId)
onSuspend(frameId, activationId)
onResume(frameId, newActivationId, returnedFrameId, outcome)
onClose(frameId)
call(frameId, currentActivationId, targetSubsystemKey, input)
return(frameId, currentActivationId, outcome)
```

SDK MUST NOT：

- 生成公共 frameId / activationId；
- 保存/要求公共 callerFrameId 才能 return；
- 自动增加 `system.call / frame.result / frame.close(reason)`；
- 让 revoked Activation 恢复有效；
- 加入 Frame ready/status；
- 把 Frame lifecycle 绑定到 Render / Process / Transport。

## 5. `web-renderer`

实现 Main Control State、System Data Connection Registry、Render Registry/Store/Scheduler、Frame Input Registry/Input Router、Resource Client。

Renderer 只镜像 Main current Input Target，不自行创建或恢复 Activation；Frame Batch B 不直接向 Renderer 暴露 RPC wire。

## 6. `game-package` / `fsdb-content-service` / `pwa-host`

`game-package` 负责 Manifest/Entry/Descriptor Loader 与 Launcher Entry validation，不 spawn Runtime。

`fsdb-content-service` 提供 Desktop/PWA 统一只读 Content API。

`pwa-host` 负责 Worker/MessagePort/Service Worker/OPFS。PWA Control Transport 尚未冻结，但不得改变 Subsystem Control v1 或 Frame Batch A/B 的应用层方法/字段语义。

## 7. `map-subsystem`

`loom.map` 通过 `subsystem-sdk` 实现 Frame Control/Input Adapter、Coordinator、Runtime Core/Loop、Render Manager/Projector、Repository。

一个 Process 可以承载多个 Frame/Input Context；业务 world/session/render 如何共享由地图自己决定。

Frame Adapter 必须：

- `frame.initialize` 只接收 `frameId + input`；
- 不依赖 `callerFrameId` wire；
- `frame.resume` 同步处理 Child Outcome 和新 Activation；
- `frame.close` 不要求 reason；
- call/return 使用 `frame.call / frame.return`；
- no-value completion 显式返回 `value:null`。

## 8. `test-subsystems`

建议包含：

```text
hello-ready
hello-invalid-key
hello-reused-token
never-ready
early-exit
shutdown-normal
control-disconnect
frame-schema-valid
frame-schema-invalid
nested-call
same-subsystem-call
multi-frame-input
stale-activation
frame-outcome-failure
render-without-frame
shared-render-multi-frame
failure
```

## 9. Desktop / PWA 入口

```text
Subsystem ⇄ Main Control Transport
    ├── Subsystem Control Protocol v1
    └── Frame / Call Protocol v1

Renderer ⇄ Subsystem System Data Transport
    ├── Connection Layer
    ├── Render Update Protocol
    └── User Input Protocol
```

协议共享 Transport 不代表共享 lifecycle、identity 或 error model。

## 10. 依赖规则

```text
protocol packages
    不依赖实现包

main-system
    → subsystem-control / frame-call / launcher / game-package / content contracts

subsystem-sdk
    → subsystem-control / frame-call / connection / render / input / content contracts

web-renderer
    → connection / render / input / content contracts

map-subsystem
    → subsystem-sdk / render / input / content contracts
```

禁止：

- Main/SDK 私自增加 Batch B 未冻结字段；
- `callerFrameId` 变成 Subsystem-side public authority；
- `frame.call` 被实现成长时间等待 Child outcome 的 RPC；
- `frame.resume` 被拆成 resume + activate 两个公共 RPC；
- `frame.close` 增加实现私有 reason；
- `FrameOutcome.completed` 省略 value；
- Frame / Call 重新定义 Runtime shutdown/restart；
- Renderer 用 Stack 控制 Render lifecycle。

## 11. Schema 与 Fixture Layout

建议：

```text
frame-call-protocol/
├── schema/
│   ├── frame-initialize.schema.json
│   ├── frame-activate.schema.json
│   ├── frame-suspend.schema.json
│   ├── frame-resume.schema.json
│   ├── frame-close.schema.json
│   ├── frame-call.schema.json
│   ├── frame-return.schema.json
│   └── frame-outcome.schema.json
├── generated/
├── src/
└── test-fixtures/
```

Batch B fixture 至少覆盖：

```text
exact method namespace / direction
params/result additionalProperties=false
initialize without callerFrameId
activate new activation
suspend current activation
resume new activation + outcome
close frameId only
call targetSubsystemKey + childFrameId result
return no caller identity
completed.value required
cancelled exact shape
failed outcome shape
system.call rejected
frame.result rejected
close reason rejected
invalid params → -32602
```

Batch C 再增加 transaction/ordering fixture，不应在 Batch B schema test 中提前编码未冻结顺序。

## 12. 发布策略

第一阶段可以保持 monorepo + unified version。Frame / Call v1 在 Batch F 前整体仍 pre-stable / Draft，但 Batch A/B 已冻结的模型与 wire fields 必须接受兼容性检查，不能被普通实现重构静默修改。
