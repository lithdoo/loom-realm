# Schema Form Submit Control、Loading 与 Local Storage 改造提案

> 状态：**Proposed / Design / Not Implemented**
>
> 位置：`game-libs/schema-form/submit-control-and-local-storage.md`
>
> 所属包：`@loomrealm-game/schema-form`
>
> 基线设计：[Schema Form v1 Design](./DESIGN.md)
>
> 相关 Framework Contract：[Web Presentation API v1](../../doc/15-contracts/web-presentation-api-v1.md)、[Render Update v1](../../doc/15-contracts/render-update-v1.md)

本文提出对 Schema Form 的有限能力扩展，用于支持 caller / 当前 Subsystem 主导的异步提交流程、表单级 Loading、Subsystem → WebComponent 的验证失败反馈，以及字段级 Browser `localStorage` 草稿记忆。

本文只定义后续实现的目标、API 语义、状态边界和验收条件。**本提案批准后，直接扩展现有 Schema Form V1，不另起 V2。** 已确认当前库没有其他外部包依赖，因此不需要为外部消费者维持第二套 Schema 版本；现有调用方式仍保持 source-compatible。本文不修改当前 Runtime、Browser bundle 或 Framework Contract，也不声明功能已经实现或通过 qualification。当前 DESIGN.md 继续描述已实现代码；本提案对应的 V1 规范变更应在后续实现 PR 中同步合并到 DESIGN.md。

---

## 1. 背景

当前 Schema Form 的提交路径是：

```text
Browser submit
→ current presentation snapshot
→ Schema Form Runtime
→ built-in validation
→ validateOnSubmit
→ no errors
→ immediately resolve { type: "submitted", value }
→ cleanup RenderDomain
```

这适合纯同步验证，但不能表达以下产品需求：

```text
submit
→ caller 开始异步校验 / 保存
→ UI 禁用并显示 loading
→ caller 明确决定：
     success → close
     failure → cancelLoading + show validation errors
```

另外，某些表单字段需要把玩家最近一次提交时的输入保存在当前 Browser 的 `localStorage`，下次打开同类表单时作为默认草稿恢复。

本提案保持现有 Authority Partition：

```text
Caller / current Subsystem
→ 业务异步操作
→ 最终提交成功决定
→ 调用 Schema Form submit-control

Schema Form Runtime
→ canonical form value
→ built-in/scripted validation
→ form lifecycle
→ loading retained fact
→ submit attempt lifetime

Renderer / Web Presentation
→ readonly/current presentation
→ loading UI
→ Browser-local localStorage
→ transient validation feedback presentation
```

Schema Form 仍不是独立 Subsystem，也不通过 `frame.call("schema-form")` 调用自己。

---

## 2. 目标

本提案只增加以下能力：

1. caller 可提供 `onSubmit` callback；
2. `onSubmit` **不通过返回值表达成功或失败**；
3. callback 通过显式 submit-control 决定：
   - `setLoading()`
   - `cancelLoading()`
   - `sendValidateError(...)`
   - `close()`
4. Schema Form root 增加 retained `loading` attribute；
5. `loading=true` 时禁用所有表单字段和 action buttons，并阻止用户取消；
6. 复用现有 `RenderDomain.emit() → receiveRenderEvent()` 作为 Schema Form 的 Subsystem → WebComponent transient feedback path；
7. field 增加可选 `localstorageKey`，用于 Browser-local 草稿恢复和 submit-attempt 保存；
8. 未使用新能力的现有调用保持现有行为。

---

## 3. 非目标

本提案不引入：

- 新的 Framework Render Event 协议；
- Render Event ACK / result / retry；
- 网络存储、云存储或跨设备同步；
- `localStorage` 作为 gameplay / Shared State authority；
- Schema Form 自己执行远程请求；
- 异步 `validateOnSubmit` DSL；
- 通过 `onSubmit` 返回 `boolean` / result 表示提交成功；
- 新的独立 Schema Form Subsystem；
- 通用表单插件系统、field provider 或 JSON Schema 兼容层。

---


## 4. Public API 提案

### 4.1 Submit callback

    export interface SchemaFormSubmitControlV1 {
      setLoading(): void;
      cancelLoading(): void;
      sendValidateError(
        errors: readonly SchemaFormExternalValidationErrorV1[],
      ): void;
      close(): void;
    }

    export interface SchemaFormExternalValidationErrorV1 {
      readonly field: string;
      readonly errorMsg: string;
    }

    export interface SchemaFormRequestV1 {
      readonly schema: SchemaFormV1;
      readonly initialValue?: SchemaFormDataV1;
      readonly cancelable?: boolean;
      readonly onSubmit?: (
        value: SchemaFormDataV1,
        control: SchemaFormSubmitControlV1,
      ) => void | Promise<void>;
    }

`Promise<void>` 只描述 callback 的异步 lifetime 和异常传播；**Promise resolve 不表示 submit success**。成功只能由 control.close() 表达。

- onSubmit 缺省时，保持现有 V1 自动提交行为。
- 配置 onSubmit 后，Runtime 不因 callback 返回或 Promise resolve 自动关闭。
- control 只在创建它的当前 Submit Attempt 仍有效时可用。
- close() 是成功 settlement 操作；cancelLoading() 不是取消业务操作，也不是提交失败 settlement。
- callback 正常结束但未调用 close() 时，表单保持打开并释放该 attempt；如果仍处于 Loading，Runtime 会自动清除 Loading，避免表单永久锁定。

### 4.2 Field localStorage declaration

    interface SchemaFormFieldBaseV1 {
      readonly key: string;
      readonly label: string;
      readonly description?: string;
      readonly required?: boolean;
      readonly localstorageKey?: string;
    }

本文冻结 public property 拼写为 localstorageKey。

localstorageKey 是 Browser Presentation hint，不改变 field semantic key，也不是 Shared State / Content key。它必须是非空 Unicode scalar string，UTF-8 长度不超过 256 bytes。同一 SchemaFormV1 内不得重复。

### 4.3 V1 versioning decision

本次直接扩展现有 V1：

- SchemaFormV1.version 仍为 1；
- onSubmit 和 localstorageKey 都是 optional；
- 不增加 V2 类型、入口或迁移层；
- 旧调用方不传新字段时，行为保持不变；
- strict schema validator 必须把 localstorageKey 加入 field base allowlist，并验证类型、长度和重复 key；
- SchemaFormRequestV1 validator 必须接受可选 onSubmit，并拒绝非 function 值。

当前 DESIGN.md 的 Frozen 标记代表当前已实现 V1 的规范基线，不代表它永远不能被明确修订。实现 PR 必须同步更新 DESIGN.md 的 Public API、Schema validation、lifecycle、RenderData 和 Browser Presentation 章节；不得只让提案文档长期覆盖正式规范。


## 5. Submit execution model

### 5.1 Legacy path

没有 onSubmit 时保持现有行为：

    submit
    → construct canonical candidate
    → built-in validation
    → validateOnSubmit
    → errors: keep open
    → no errors: resolve submitted + cleanup

这保证现有调用方无需迁移。

### 5.2 Caller-controlled path

配置 onSubmit 后：

    Browser submit
    → collect complete presentation snapshot
    → best-effort localStorage write (after size preflight)
    → emit submit
    → Runtime validates candidate
    → validation errors: keep open, callback not invoked
    → valid candidate: freeze immutable submit snapshot
    → create Submit Attempt
    → invoke onSubmit(snapshot, control)
    → DO NOT auto-close

callback 的返回值和 Promise resolve 都不触发提交成功。

caller 必须显式选择后续动作：

    success
    → control.close()

    business validation failure
    → control.sendValidateError(...)
    → control.cancelLoading()
    → callback returns

如果业务不需要异步操作，可以直接：

    onSubmit(value, form) {
      persistSynchronously(value);
      form.close();
    }

close() 应是 callback 中最后一个有意义的控制操作。调用 close() 后，该 attempt 已成功 settlement；之后 callback 即使继续执行或抛出异常，也不能覆盖已经发生的成功结果。

### 5.3 Async usage

推荐调用：

    const result = await openSchemaForm(scope, frame, {
      schema,
      cancelable: true,

      onSubmit: async (value, form) => {
        // 必须在第一个 await 之前进入 Loading。
        form.setLoading();

        const errors = await validateRemotely(value);

        if (errors.length !== 0) {
          form.sendValidateError(errors);
          form.cancelLoading();
          return;
        }

        await persist(value);
        form.close();
      },
    });

约束：

- 异步 callback 必须在第一个 await 之前调用 setLoading()，避免等待期间用户继续编辑或取消。
- cancelLoading() 用于业务失败、恢复编辑的路径；调用后应尽快结束 callback，不应再启动新的异步阶段。
- 如果仍有后续异步工作，应继续保持 Loading，直到最终成功 close() 或失败 cancelLoading()。
- 异步工作必须由 callback 返回/await 对应 Promise。不要启动 detached async work 后立即让 callback 返回。


## 6. Submit Attempt 状态机与 stale control

每次通过同步验证的 submit 分配一个单调递增的 Submit Attempt identity。每个 attempt 捕获不可变 submit snapshot，并拥有一个只属于该 attempt 的 control。

### 6.1 States

    IDLE
    → CALLBACK_ACTIVE
    → LOADING
    → CALLBACK_ACTIVE
    → IDLE

    任意 active state
    → SUBMITTED / CANCELLED / REJECTED / ABORTED

状态含义：

| State | 含义 |
|---|---|
| IDLE | 没有正在执行的 submit callback，可以提交 |
| CALLBACK_ACTIVE | callback 已启动，attempt 锁定；重复 Submit 被忽略 |
| LOADING | 当前 callback 调用 setLoading()；字段和所有 action controls 禁用 |
| Terminal | 表单已 settlement，所有 control 失效 |

### 6.2 Transitions

| 当前状态 | 操作 / 事件 | 后续状态与结果 |
|---|---|---|
| IDLE | 同步验证失败 | 留在 IDLE，更新 retained errors，不调用 callback |
| IDLE | 同步验证成功 | 创建 snapshot 和 attempt，进入 CALLBACK_ACTIVE |
| CALLBACK_ACTIVE | 重复 Submit | 忽略，不创建第二个 callback |
| CALLBACK_ACTIVE | setLoading() | 进入 LOADING，发布 retained loading="true" |
| CALLBACK_ACTIVE | callback 正常结束且未 close() | attempt 结束，回到 IDLE，表单保持打开 |
| LOADING | cancelLoading() | 移除 Loading，回到 CALLBACK_ACTIVE；attempt 锁保留到 callback Promise settle |
| LOADING | callback 正常结束且未 close() | Runtime 自动移除 Loading，结束 attempt，回到 IDLE |
| 任意 active state | close() | 立即进入 SUBMITTED，resolve immutable submit snapshot |
| 任意 active state | callback throw / Promise reject | 进入 REJECTED，cleanup + reject |
| loading=false 且 cancelable=true | 用户 Cancel | 进入 CANCELLED，resolve cancelled |
| loading=true | 用户 Cancel / Escape / dialog hide | 忽略 |
| 任意 active state | Frame abort | 进入 ABORTED，cleanup + reject AbortError |

### 6.3 Attempt lifetime and control validity

- 同一 active callback lifetime 内的重复 submit 必须忽略。
- attempt lock 从 callback 开始一直保持到 callback Promise settle，或表单先行 terminal settlement；cancelLoading() 不释放 attempt lock。
- 同一时刻最多存在一个 active attempt。
- control 只对创建它的 current attempt 有效。
- callback 正常结束但没有 close() 时，control 失效，表单回到 IDLE。
- callback 正常结束时如果仍处于 Loading，Runtime 自动清除 Loading；这只是防止 UI 卡死的安全回收，不代表业务成功。
- form 已 settlement、Frame 已 abort、或 attempt 已结束后，旧 control 的 setLoading() / cancelLoading() / sendValidateError() / close() 均安全 no-op。
- **所有 control method 固定先检查 control 是否仍为 current。stale 时立即 return，不再校验参数、不 emit、不 update、不 throw。**
- 只有 current control 才继续执行 method-specific validation。current sendValidateError(errors) 若参数非法，必须在任何 Render Event / state mutation 前同步抛 TypeError；若 caller 捕获该 TypeError，attempt 本身仍保持 active。
- callback throw 或 Promise rejection 是 program / operation failure，不是 validation failure；若尚未 terminal settlement，统一 cleanup 并 reject openSchemaForm()。
- 所有 terminal path 使用 settle-once / first-terminal-wins 规则。若 close() 已先成功 settlement，之后 callback rejection 不得把结果改成 reject；Runtime 必须仍然消费该 Promise rejection，避免产生 unhandled rejection。

### 6.4 Cancel and async operation ownership

cancelable=true 且当前不在 Loading 时，用户可以取消表单。若此时 callback 已启动但没有按约定先调用 setLoading()，取消会结束表单并使 control 失效，但**不会自动中止 caller 自己的 fetch / Promise**。

需要可取消的业务请求时，caller 必须使用自己的 AbortController 管理该请求，并在表单结果为 cancelled、Frame abort 或业务流程终止时主动 abort。Schema Form 不承诺取消任意外部异步操作。

正确的异步 callback 应在第一个 await 前 setLoading()，因此正常异步提交期间用户取消入口会被禁用。


## 7. Loading 设计

### 7.1 Retained root attribute

Loading 是 root RenderNode 的 retained **attribute**，不是 root RenderData 的 data.loading 字段：

    root attrs.loading absent
    → not loading

    root attrs.loading = "true"
    → loading

初始化时不设置 loading。

setLoading()：

    current submit control
    → RenderDomain.update(root attrs set loading="true")
    → Web Projector
    → `<lr-schema-form loading="true">`

cancelLoading()：

    current submit control
    → RenderDomain.update(root attrs remove loading)
    → Web Projector
    → `<lr-schema-form>`

Loading 是 Schema Form Runtime 持有的 retained presentation fact，不由 Browser 自行猜测。

### 7.2 Browser behavior and propagation

`<lr-schema-form loading="true">` 时必须：

- 禁用 Submit、Cancel、Close 等 root action buttons；
- Submit button 展示 loading progress；
- 阻止 dialog hide / Escape，不发 cancel；
- 不产生新的 change / submit / cancel custom event；
- Root 对所有直接子 lr-schema-form-field 设置内部 disabled 状态；
- 每个 lr-schema-form-field 再将 disabled 传递给自己的 wa-input、wa-textarea、wa-checkbox、wa-select；
- Field 和 Root 的事件处理函数都检查 disabled/loading，不能只依赖 Web Component 的 disabled 外观属性。

Loading 结束后，Root 根据当前 cancelable 和字段状态恢复交互。

### 7.3 Loading 与 cancelable

    cancelable=false
    → 用户任何时候都不能取消

    cancelable=true + loading=false
    → 用户可以取消

    cancelable=true + loading=true
    → 暂时不能取消

Frame abort 永远高于 Loading：

    Frame abort
    → cleanup
    → reject AbortError

Loading 不得阻止 Frame lifecycle termination。

### 7.4 setLoading / cancelLoading idempotence

    setLoading() while already loading
    → no additional semantic change

    cancelLoading() while not loading
    → no additional semantic change

两者都只控制表单 Loading 状态，不表示业务成功或失败。

cancelLoading() 不取消 caller 自己的 Promise / fetch / operation，也不释放当前 Submit Attempt 的重复提交锁。调用后 callback 应尽快 return；在 callback Promise settle 之前，不允许开始下一次 Submit。


## 8. close() 语义

close() 是 caller-controlled submit path 中唯一成功 settlement 操作。

合法 close()：

    current attempt control.close()
    → mark submitted (first terminal wins)
    → submitted value = immutable snapshot that created this submit attempt
    → cleanup RenderDomain / event subscription / Frame abort listener / active registration
    → resolve {
         type: "submitted",
         value: submittedSnapshot
       }

close() 不等于 user cancel。

即使 Browser 在 async operation 期间发生 Presentation reload，成功值也必须来自 Runtime 保留的 submit snapshot，而不是重新读取 DOM。

close() 一旦成功执行，表单立即 settlement，control 随即失效。callback 应把 close() 作为最后一个有意义的操作；之后抛出的异常不能推翻已经完成的 submitted settlement。


## 9. Subsystem → WebComponent validation feedback

### 9.1 复用已有 Render Event

Framework 已经提供：

    RenderDomain.emit({ targetKey, name, data })
    → render.event
    → Renderer applicability/currentness gate
    → WebProjector live target lookup
    → receiveRenderEvent({ name, data })

因此本提案**不新增 Framework 协议**。

Schema Form root lr-schema-form 后续实现 receiveRenderEvent()，并定义 Schema Form-private event：

    name = "validate-error"

payload：

    {
      errors: readonly {
        field: string;
        errorMsg: string;
      }[];
    }

sendValidateError(errors) 负责：

1. 验证 field 必须存在于当前 schema；
2. errorMsg 必须是非空 Unicode scalar string；
3. 同一 payload 不允许重复 field；
4. 错误数量不得超过当前 schema field 数；
5. payload compact JSON UTF-8 size 不得超过 131,072 bytes；
6. 将 payload 通过当前 RenderDomain emit 到 root key。

无效参数在调用时同步抛出 TypeError。空数组 sendValidateError([]) 是合法 no-op：不清除任何已展示错误，也不产生 Render Event。sendValidateError() 的职责仅是发送新的业务校验错误。

validate-error payload 是 **partial field error update**，不是完整 error snapshot：

- payload 中列出的每个 field 都把自己的 current displayed error 替换为新的 errorMsg；
- payload 中未列出的 field 保持当前 displayed error 不变；
- 同一 payload 禁止重复 field，因此一个 event 内不存在同 field 的内部覆盖顺序；
- 多个 validate-error events 之间继续按 Browser 实际接收顺序 last-delivery-wins。

### 9.2 Transient semantics

该 async/business validation feedback 明确定义为 **transient Presentation feedback**：

- 不进入 Renderer retained Store；
- 不进入 Shared State；
- 不修改 canonical form data；
- Renderer reload 后不 replay；
- target stale / removed 时允许按现有 Render Event Contract drop；
- Browser 只把它作为当前表单交互中的错误提示。

这与现有 built-in / scripted validation error 不同：

    built-in / validateOnChange / validateOnSubmit errors
    → Schema Form Runtime retained errors
    → RenderData

    sendValidateError(...)
    → caller-driven transient business validation feedback
    → Render Event

如果未来业务要求 async validation error 在 Renderer reload 后继续存在，应另行设计 retained error path，而不是改变 Render Event 的 no-history 语义。

### 9.3 Error replacement and clearing rule

Schema Form 不按错误来源设置固定优先级。每个 field 在 Browser 中只有一个 **current displayed error**，按实际发生顺序更新：

    later error update
    → replaces earlier displayed error

错误来源可以是：

- Runtime retained validation error（built-in / validateOnChange / validateOnSubmit）；
- Subsystem 通过 sendValidateError() 发送的 transient business error。

两者没有永久优先级；**后发生的错误更新覆盖前一个当前展示错误**。

field 发生本地 change 时：

    local field edit
    → immediately clear current displayed error
    → emit ordinary complete "change" snapshot
    → Runtime may run built-in validation / validateOnChange
    → if Runtime later returns a new error, display that new error
    → if no new error arrives, field remains without displayed error

因此，field change 不会“清除业务错误后自动回退到之前保存的 Runtime 错误”。之前已经展示过的错误在该次用户编辑发生时全部视为 stale presentation feedback；只有 change 之后真正新产生 / 新下发的错误才重新显示。

### 9.4 Event-order semantics

精确规则：

- “后发生”只以 Browser **实际收到的新 presentation input** 为准；
- Runtime 内部重新执行 built-in validation / validateOnChange / validateOnSubmit，但没有产生新的 field RenderData delivery，不算新的错误事件；
- Browser 收到新的 field RenderData 且其中包含 error → 该 error 覆盖该 field 当前展示错误；
- Browser 收到新的 field RenderData 且其中不包含 error → 清除该 field 当前展示错误；
- Browser 收到 sendValidateError() 对应的 validate-error Render Event → 其中该 field 的 business error 覆盖当前展示错误；
- 同一 field 多次实际收到错误更新 → 最后到达的有效 presentation input 覆盖之前的；
- field 本地 change → 立即清空该 field 当前展示错误，然后发出普通 complete change snapshot；
- 如果该 change 触发 Runtime validation，只有 Browser 后续真正收到新的 field RenderData 时，才据此重新设置或清除错误；
- 如果 Runtime 重新计算出的 error 与旧投影完全相同，且 RenderDomain 最终没有产生新的该 field RenderData delivery，则 Browser 不做任何错误覆盖；
- sendValidateError([]) 不修改任何当前展示错误，也不产生 Render Event；
- Renderer reload 不 replay transient business error；reload 后展示由当前 retained RenderData 决定；
- error replacement 只影响 Presentation 当前展示，不改变 canonical value，也不重写 Runtime validation result/history。

因此本提案**不引入 validationRevision / errorRevision**。Browser 不推测 Runtime 是否“重新验证过”，只消费自己实际收到的 RenderData / RenderEvent。实现上维护一个 current displayed error 即可。**唯一主动清空 current displayed error 的普通交互是该 field 自己发生本地 change；Submit Attempt 开始本身不清错误。**


## 10. localstorageKey 语义

### 10.1 定位

localstorageKey 只表示：

> 当前 Browser / origin 中，该字段最近一次 **submit attempt** 的草稿记忆 key。

它不是：

- gameplay state；
- account setting authority；
- successful business persistence；
- save slot；
- Shared State；
- Content；
- 跨设备同步。

因此 Browser localStorage 缺失、被清理、quota/error、隐私模式限制都不得让 Schema Form Runtime 失败。

### 10.2 Load precedence

打开表单时，每个 field 的初始值优先级定义为：

    explicit request.initialValue[field.key]
    → valid localStorage value (when restore is eligible and pending)
    → field.default
    → field-kind empty value

initialValue 的优先级按 field 判断：只要 initialValue 显式包含该 field key，即使值是 ""、0 或 false，也禁止该字段从 localStorage 恢复；其他未显式提供的字段可以恢复。

### 10.3 Internal projection exact shape

为了让 Browser 不猜测初始值来源和 restore lifetime，V1 internal Browser projection 固定扩展为：

    export interface SchemaFormRenderDataV1 {
      readonly title?: string;
      readonly description?: string;
      readonly cancelable: boolean;
      readonly fieldCount: number;
      readonly restorePending: boolean;
    }

    interface SchemaFormFieldRenderBaseV1 {
      readonly key: string;
      readonly label: string;
      readonly description?: string;
      readonly required: boolean;
      readonly error?: string;

      readonly restoreAllowed: boolean;
      readonly localstorageKey?: string;
    }

这些字段属于 Schema Form 的 RenderData ABI，不是新增 public Schema declaration。

精确规则：

- fieldCount 必须等于 schema.fields.length，整数范围 0..128；
- localstorageKey 存在时必须与已通过 schema preflight 的 public declaration 完全相同；
- restoreAllowed 是每个 field 的 immutable session fact；
- restoreAllowed=true 当且仅当 field 声明 localstorageKey 且 request.initialValue 没有 own property field.key；
- 没有 localstorageKey 时 restoreAllowed 必须为 false；
- restorePending 是 Runtime/Session retained fact，不是 Browser private flag；
- restorePending 初始值 = 是否存在至少一个 restoreAllowed=true 的 field；
- restorePending 只能 true → false，一旦 Runtime 消费 restore phase，当前 Schema Form Session 内不得再次变回 true；
- Browser 的 validateRootData / validateFieldData 必须继续使用 exact closed-shape validation：新增字段是上述 required/optional 关系，不接受额外成员。

loading 仍然是 root RenderNode attribute；restorePending 是 root RenderData。两者不得混用。

### 10.4 Session-level one-shot restore protocol

LocalStorage restore 属于 **Schema Form Session lifetime**，不是 WebComponent instance lifetime。

Browser root 收到：

    restorePending=false
    → 不读取 localStorage
    → 不执行 restore barrier

    restorePending=true
    → 执行一次当前 Presentation instance 的 restore attempt

restore attempt：

    1. root enters local initialization barrier
    2. wait until exactly fieldCount direct lr-schema-form-field children
       have received their first valid RenderData
    3. inspect only fields with restoreAllowed=true + localstorageKey
    4. read/parse/type-check localStorage values
    5. build a detached complete presentation snapshot in memory
       without mutating controls yet
    6. compact-size preflight the complete { values } payload
    7. if restored candidate is oversized:
         discard all localStorage substitutions
         fall back to the original current RenderData-derived snapshot
    8. size-preflight the fallback snapshot too
    9. if fallback is also oversized:
         apply no localStorage substitutions
         emit no restore event
         end the local barrier and remain usable
    10. otherwise apply the accepted restored substitutions to the controls
    11. emit one Schema Form-private custom event:
          name = "restore"
          data = { values: completeSnapshot }
    12. end the local initialization barrier; do not wait for ACK

restore event 使用与 change/submit 完全相同的 complete values payload grammar 和 131,072-byte limit，但 event name 独立为 "restore"。这是 Schema Form 自己新增的 reverse custom event，不新增 Framework protocol。

Runtime 规则：

- 只在 restorePending=true 时接受合法 restore event；
- restore payload malformed / oversize → ignore，restorePending 保持 true，zero canonical/error mutation；
- canonical 语义相同 = exact own-key set 相同且每个 string/number/boolean JSON primitive value 相等；finite number 使用 JSON number 语义比较，-0 与 0 视为相同；
- 合法 restore candidate 与 current canonical 语义相同：
  - 只把 restorePending 设置为 false；
  - 不运行 built-in / validateOnChange；
  - 不制造打开表单即显示 validation error 的新行为；
- 合法 restore candidate 与 current canonical 不同：
  - restorePending 设置为 false；
  - candidate 走与 ordinary change 相同的 built-in + validateOnChange；
  - canonical/errors 按该 validation pass 更新；
- restorePending=false 后收到任何 restore event → ignore；
- restorePending=false 必须通过 retained root RenderData 投影，因此任何后续 Renderer/WebComponent instance 都能看到 restore 已经消费，不再读取 localStorage；
- 每次 restorePending true→false 且表单仍 active 时，即使 canonical/errors/field RenderData 没有变化，也必须产生 root RenderData update 使 restorePending=false presentation-observable；若同一步直接 terminal 并关闭 RenderDomain，则无需额外发送不可观察的 root update。

为了处理 reverse input 可能丢失的情况：

- Browser 发出 restore 后不等待 ACK，避免 UI 永久锁住；
- 如果 candidate 与 fallback snapshot 都超过 131,072 bytes，Browser 不发 restore；restorePending 保持 true，用户可继续编辑直到后续合法 change/submit 消费它；
- 如果 restore event 丢失，restorePending 仍可能保持 true；
- Runtime 在 restorePending=true 时收到任意 **合法 ordinary change 或 submit**，必须先把 restorePending 消费为 false，再按原 change/submit 语义处理完整 snapshot；
- 因此一旦用户编辑/提交已经到达 Runtime，后续 Renderer 重建就绝不会再用旧 localStorage 覆盖该已接受的 canonical state；
- 只有在 restore event 和后续用户输入都尚未被 Runtime 接受时，新 Presentation instance 才可能再次尝试 restore；此时 Runtime 尚没有更新后的用户 authority，重复尝试是安全的。

这定义的是 Session-level authoritative one-shot，而不是“每个 WC instance 无条件 restore 一次”。

### 10.5 Storage encoding and validation

每个 localstorageKey 保存一个 JSON primitive：

    string  → JSON string
    number  → finite JSON number
    boolean → JSON boolean
    number/select unset → JSON null

读取时：

- localStorage.getItem(key) === null 表示不存在；
- JSON parse failure → ignore；
- string field 只接受 Unicode scalar string；
- number field 只接受 finite number；
- boolean field 只接受 boolean；
- select field 只接受当前 options 中存在的 string；
- number/select 的 JSON null 表示 unset；
- storage API throw → ignore，并继续 restore attempt。

值的 JSON 类型不匹配或 select option 已失效时忽略该字段的 storage value。

值类型正确但违反 minLength、min、max、integer 或 scripted validation 时，仍允许进入 restored candidate；若该 candidate 与 canonical 不同，则由 Runtime built-in / validateOnChange 正常产生错误。Browser 不自行执行这些 schema validation rules。

无效 storage 数据不得导致 openSchemaForm() reject。

### 10.6 Restore → Runtime authority

localStorage 是 Browser source，不是 canonical authority。

Browser 只能产生 restore candidate；Runtime 接受合法 restore/change/submit snapshot 后，canonical state 才发生变化。

restore candidate 必须：

- 保留所有未恢复字段的当前 RenderData 值；
- 只替换 restoreAllowed=true 且 storage primitive/type/option 合法的字段；
- 始终包含 schema 的完整 field-key set；
- number/select unset 使用 null；
- string/boolean 使用 concrete value；
- 不绕过 Runtime candidate validation；
- 不直接修改 Shared State / gameplay state。

Renderer/WebComponent reload 不能重新定义 restore authority；是否还能 restore 只由 Runtime retained restorePending 决定。

### 10.7 Submit-time persistence

localstorageKey 的保存时点固定为：

    Browser user submit
    → collect complete current presentation snapshot
    → compact JSON size preflight (<= 131,072 bytes)
    → if oversized: show existing size error; do not write storage; do not emit submit
    → best-effort write configured localStorage fields
    → emit submit custom event

因此，即使后续：

- built-in validation 失败；
- validateOnSubmit 失败；
- async business validation 失败；
- caller cancelLoading()；

最近一次 submit attempt 仍可成为下次打开时的 Browser-local draft。

这是刻意选择：localstorageKey 表达“记住玩家最近尝试提交的输入”，**不表达“业务提交已经成功”**。

每个 field 的 storage write 独立 best-effort；某一个 key 写入失败不得阻止其他字段保存，也不得阻止 submit event 正常发出。

如果产品需要“只有业务成功才持久化”，应由 caller 的业务 persistence 负责，而不是复用该 field hint。

### 10.8 Key scope, collision and lifecycle

- Browser localStorage 按 origin 共享，不按 Schema Form、Subsystem 或 package 自动隔离。
- 同一 SchemaFormV1 内重复 localstorageKey 必须被 schema preflight 拒绝。
- 不同表单使用相同 key 表示有意共享同一草稿；因此建议使用产品/Subsystem/表单/字段前缀，例如 game.character-create.name。
- localstorageKey 不提供自动过期；数据会保留到应用主动清除、浏览器清理或用户清理。
- Schema 或字段含义发生不兼容变化时，应用应更换 key namespace/version，避免旧草稿被错误恢复。
- 不得使用该机制保存密码、访问令牌、会话凭据、支付信息或其他敏感数据。localStorage 对同 origin 的脚本可读，不是安全凭据存储。


## 11. Browser Presentation changes

后续实现预计只扩展现有两个组件：

    lr-schema-form
    lr-schema-form-field

### lr-schema-form

新增职责：

- validate/consume root fieldCount + restorePending RenderData；
- consume root retained loading attribute；
- 根据 loading / restore initialization barrier 禁用 root action buttons；
- 将 disabled 状态传递给所有直接 lr-schema-form-field 子节点；
- 阻止 loading 时 cancel / dialog hide；
- implement receiveRenderEvent()；
- handle validate-error；
- maintain event-ordered current displayed errors without source priority；
- coordinate field readiness + restorePending-gated localStorage restore attempt；
- emit Schema Form-private restore custom event；
- submit 前执行 size preflight 和 localStorage best-effort save。

### lr-schema-form-field

新增职责：

- validate/consume required restoreAllowed 和 optional localstorageKey projection metadata；
- 在首次 valid RenderData ready 时通知 root；
- 接收 root 的 disabled 状态并禁用具体 WebAwesome control；
- maintain/render one current displayed error；
- field local edit 时立即清空自己的 current displayed error，然后通知 root emit complete change snapshot。

Root 的 loading attribute 是唯一 Loading authority；Field 的 disabled 只是 Browser 内部向具体控件传播的 presentation state，不回写 Runtime。

restorePending 是 Runtime retained restore authority；Browser private restore-attempt flag 只能防止同一 WC instance 重复执行 barrier，不能覆盖 restorePending=false/true 的 Runtime 事实。

现有 stable editing DOM、number lexical draft、select private token mapping、focus restoration 等规则必须保持。


## 12. Validation compatibility

validation 顺序扩展为：

    schema preflight
    → initialValue preflight
    → compile validators

    restorePending=true Browser restore attempt
    → validate storage primitive/type/option
    → emit one private complete "restore" snapshot
    → Runtime candidate structural/type validation
    → candidate == canonical:
         consume restorePending only
       candidate != canonical:
         built-in
         → validateOnChange
         → canonical + retained errors
         → consume restorePending

    ordinary change
    → candidate
    → consume restorePending if still true
    → built-in
    → validateOnChange
    → retained errors

    submit
    → candidate
    → consume restorePending if still true
    → built-in
    → validateOnSubmit
    → if no errors:
         legacy path OR caller-controlled onSubmit

本提案不让 onSubmit 替代现有 schema validation。

推荐边界：

    Schema validation
    → 类型、required、范围、schema-known cross-field rules

    onSubmit
    → 网络/账户/库存/权限/服务端/业务状态等异步验证与保存

LocalStorage restore 不绕过 Runtime validation，也不直接成为 canonical authority；restore event 只是把 Browser-local candidate 送回当前 Session。restore candidate 与 canonical 完全相同时不运行 validateOnChange，以保持“没有实际恢复变化时不新增打开即报错行为”。


## 13. Failure semantics

后续实现必须区分：

    ordinary user validation failure
    → keep form active

    sendValidateError
    → transient Presentation feedback

    invalid sendValidateError arguments on current control
    → synchronous TypeError
    → zero Render Event / loading / settlement mutation

    any method call on stale submit control
    → immediate no-op before argument validation
    → no throw / no emit / no state mutation

    onSubmit returns normally without close
    → clear loading if necessary
    → release attempt lock
    → keep form active

    onSubmit throw / Promise reject before terminal settlement
    → program / operation failure
    → cleanup + reject openSchemaForm

    callback rejects after close already settled
    → first terminal wins
    → submitted result remains; rejection is consumed and cannot resettle

    user cancel while loading=false
    → resolve cancelled
    → invalidate control
    → caller-owned async operation is not automatically aborted

    user cancel while loading=true
    → ignored

    Frame abort
    → cleanup + AbortError

    Browser localStorage read/write failure
    → presentation-local best effort failure
    → form remains usable

    malformed/oversize restore event
    → ignore
    → restorePending remains true
    → zero canonical/error mutation

    restore event lost before Runtime acceptance
    → Browser does not wait
    → later valid change/submit consumes restorePending
    → future Presentation may retry only while retained restorePending is still true

    oversized submit snapshot
    → show size error
    → no localStorage write
    → no submit event

    Render Event dropped due stale target
    → no Runtime rollback
    → transient error may be lost

不得把 program failure 自动转换成 { type: "cancelled" }。

## 14. Compatibility and V1 contract update

本次采用 **in-place V1 extension**，不引入 V2：

- onSubmit optional；
- localstorageKey optional；
- loading attribute absent = false；
- cancelable 默认值继续为 false；
- 没有 onSubmit 的表单继续现有同步自动提交行为；
- 现有 field kind / value semantics 不变；
- 现有 validateOnChange / validateOnSubmit 不变；
- 不修改 Web Presentation API v1 或 Render Update v1 identity；
- 复用现有 Render Event capability 传递 validate-error；
- 复用现有 WebPresentationContext.emitCustomEvent() 增加 Schema Form-private reverse event "restore"；
- Schema Form V1 root outward custom event name set 因此从 change / submit / cancel 扩展为 change / submit / cancel / restore；restore 只服务 Browser-local draft handshake，不是 caller-facing submit result；
- 旧请求对象和旧 field declaration 不传新字段时保持兼容。

当前 DESIGN.md 仍描述当前已实现代码。实现 PR 必须在同一变更中更新 DESIGN.md，把本提案批准的 V1 API、Submit Attempt state machine、Loading、RenderEvent feedback、LocalStorage restore/save 和 failure semantics 合并为新的 V1 normative contract。

不采用“长期 override 文档”方案，避免两个文件对同一 V1 语义分别拥有权威性。实现完成前，本文保持 Proposed / Not Implemented；不得提前声称功能已经实现或通过 qualification。


## 15. 后续实现范围

预计实现只涉及 Schema Form game-lib 与其 qualification：

    game-libs/schema-form/src/model.ts
    game-libs/schema-form/src/internal/session.ts
    game-libs/schema-form/src/internal/validation.ts
    game-libs/schema-form/browser/schema-form.browser.ts
    game-libs/schema-form/test/*
    test/schema-form-v1/*
    game-libs/schema-form/DESIGN.md

仅当实现证明现有 Framework 行为不足时，才允许另开设计评审讨论 Framework Contract；本提案本身不授权修改 Framework。



## 16. 最低验收条件

后续代码 PR 至少必须证明：

1. 未配置 onSubmit 的现有 V1 submit 行为不变；
2. V1 strict schema validator 接受可选 localstorageKey，并拒绝非法类型、空 key、超长 key 和同一表单内重复 key；
3. SchemaFormRequestV1 接受可选 onSubmit，拒绝非 function；
4. 配置 onSubmit 后，同步 validation 成功不会自动关闭；
5. callback Promise resolve 不等于成功；
6. close() 才 resolve submitted，且返回本次 immutable submit snapshot；
7. close() 是 first terminal settlement；后续 callback rejection 不得改写结果；
8. callback 正常结束但未 close() 时，表单保持打开并释放 attempt lock；
9. callback 正常结束时若仍处于 Loading，Runtime 自动清除 Loading 并释放 attempt；
10. 异步 callback 在第一个 await 前调用 setLoading() 的推荐流程得到正确 Loading 行为；
11. setLoading() 产生 retained root attrs.loading="true"，而不是 root data.loading；
12. loading 时所有字段、Submit、Cancel、Close 都不可交互；
13. Root 正确把 disabled 状态传递到所有 Field 和 WebAwesome controls；
14. loading 时 Browser 不发 change / submit / cancel，Runtime 也拒绝 stale 输入；
15. cancelLoading() 移除 Loading，但在 callback Promise settle 前不释放 attempt lock；
16. cancelLoading() 不取消 caller 自己的异步操作；
17. cancelable=false 继续禁止用户取消；
18. cancelable=true + loading=true 暂时禁止用户取消；
19. Frame abort 在 loading 中仍立即终止并 reject AbortError；
20. duplicate submit 不产生并发 callback；
21. current control 的 sendValidateError 非法参数在任何 mutation/emit 前同步 TypeError；
22. stale control 的 setLoading / cancelLoading / sendValidateError / close 全部先判 stale 并直接 no-op，即使 sendValidateError 参数非法也不 throw；
23. 用户在非 Loading 状态取消时 control 失效，后续 control 调用符合 stale no-op；
24. sendValidateError() 使用现有 Render Event path；
25. unknown field / duplicate field / invalid errorMsg / oversize payload 被拒绝；sendValidateError([]) 是合法 no-op，不修改当前展示错误且不产生 Render Event；
26. validate-error 是 partial field update：只覆盖 payload 中列出的 fields，未列出 fields 的 current displayed error 保持不变；
27. Browser 正确显示 transient external errors；field edit 时清空该 field 当前展示错误，Submit Attempt 开始本身不清错误；
28. 同一 field 不按 Runtime / Subsystem 来源设固定优先级；只有 Browser 实际收到的新 field RenderData 或 validate-error Render Event 才算新的错误更新；
29. Browser 收到带 error 的新 field RenderData 时，该 error 覆盖当前展示错误；收到不带 error 的新 field RenderData 时，清除当前展示错误；
30. Browser 收到 validate-error Render Event 时，对应 field 的 business error 覆盖当前展示错误；
31. field 本地 change 时立即清空该 field 当前展示错误，再发出普通 complete change snapshot；
32. field change 后即使 Runtime 内部重新执行 validation，只要 Browser 没有收到新的该 field RenderData，就不得据此推测或恢复任何错误；
33. field change 后如果 Runtime 实际下发新的 field RenderData，Browser 按该 RenderData 的 error presence 重新设置或保持清空；
34. 已被 field change 清除或被后续 presentation input 覆盖的旧 Runtime / business error 不得自动恢复；
35. 不引入 validationRevision / errorRevision；错误事件顺序完全由 Browser 实际接收顺序定义；
36. Renderer reload 不 replay transient validation Render Event；reload 后展示由当前 retained RenderData 决定；
37. root RenderData exact shape 要求 cancelable、fieldCount、restorePending，title/description optional；fieldCount == schema.fields.length 且范围 0..128；
38. field RenderData base exact shape 要求 restoreAllowed boolean，localstorageKey optional；没有 localstorageKey 时 restoreAllowed 必须 false；
39. restoreAllowed=true 当且仅当 field 有 localstorageKey 且 initialValue 没有 own field key；显式 "" / 0 / false 也会禁止 restore；
40. restorePending 初始值等于是否存在任一 restoreAllowed field，并且 Session 内只能 true → false；
41. restorePending=false 的 Presentation 不读取 localStorage、不执行 restore barrier；
42. restorePending=true 时，root 等待 exactly fieldCount 个 field 首次 valid RenderData 后才执行 restore attempt，barrier 期间禁止用户输入/提交；
43. restore candidate 在内存中完成 type/option/size preflight 后才写入 controls；
44. oversized restored candidate 不应用任何 localStorage substitution；若原 RenderData-derived fallback snapshot 可编码且不超限，则用 fallback 发 restore；
45. restored candidate 与 fallback snapshot 都超限时，Browser 不发 restore、解除本地 barrier并保持可用，restorePending 保持 true；否则每次 restore attempt 发一个 private "restore" complete snapshot且不等待 ACK；
46. restore event payload 与 change/submit 使用相同 complete values grammar 和 131,072-byte limit；
47. Runtime 只在 restorePending=true 时接受合法 restore；pending=false 的 restore 被忽略；
48. 合法 restore candidate == canonical 时只 consume restorePending，不运行 validateOnChange、不新增 validation error；
49. 合法 restore candidate != canonical 时走 built-in + validateOnChange，并与 consume restorePending 一起更新 current Session；
50. malformed/oversize restore 被忽略且 restorePending 保持 true，zero canonical/error mutation；
51. restorePending true→false 且表单仍 active 时，即使 field data 未变化也必须投影新的 root RenderData；直接 terminal close 时无需额外 root update；
52. restorePending=true 时任意合法 ordinary change 或 submit 都会先 consume restorePending，再按原语义处理，从而防止 Renderer 重建后重新覆盖已接受用户状态；
53. restore event 丢失不会锁死 UI；在 Runtime 尚未消费 restorePending 前新 Presentation 可以重试，一旦 pending=false 永不再 restore；
54. Renderer/WebComponent 重建后 restorePending=false 时不会重新从 localStorage 覆盖 Runtime 当前 canonical state；
55. malformed JSON、类型错误、失效 select option、storage API throw 不影响表单打开；
56. 类型正确但违反 field validation rule 的 restored value 可进入 candidate，并由 Runtime 在 candidate 发生变化时显示 validation error；
57. 同一表单内重复 localstorageKey 被拒绝；跨表单相同 key 按 origin 共享；
58. string ""、number 0、boolean false、select value 与 number/select unset null round-trip 正确；
59. oversized submit snapshot 不写 localStorage，也不发 submit event；
60. submit attempt 在 submit event 前 best-effort 更新所有配置的 localStorage fields；
61. failed async validation 后 localStorage 仍保留最近一次 submit-attempt draft；
62. 单个 storage key 读写失败不阻止其他字段或表单正常工作；
63. real Chromium qualification 覆盖 loading、async failure、async success、cancelability、Render Event error、Session-level restore、Renderer rebuild 和 localStorage reopen round-trip；
64. 当前 Schema Form tests 和 repository affected CI 全部通过；
65. 实现 PR 同步更新 DESIGN.md，且不修改 Framework Contract。

## 17. 实现建议顺序

建议后续代码按以下顺序落地：

    Phase 1
    → update V1 public types + strict schema/request validation
    → update DESIGN.md normative V1 contract

    Phase 2
    → Submit Attempt state machine + onSubmit + control lifetime

    Phase 3
    → retained root loading attribute + Root-to-Field disabled propagation

    Phase 4
    → validate-error Render Event + transient browser errors

    Phase 5
    → exact localStorage projection metadata + Session-level restorePending protocol
    → private restore input + restore barrier + submit-time best-effort save

    Phase 6
    → unit/browser/real Chromium qualification

    Phase 7
    → README / package documentation current facts

每一阶段必须保持现有 legacy submit path 可用，最终代码 PR 才能声明本提案实现完成。

## 18. 设计结论

本提案的核心原则是：

```text
Schema Form
→ owns input collection, synchronous schema validation,
  loading presentation state and interaction lifetime

Caller / current Subsystem
→ owns asynchronous business validation,
  persistence and final success decision

Browser Presentation
→ owns concrete controls,
  Browser-local draft memory and transient feedback

close()
→ is the only explicit caller-controlled submit-success operation
```

这样既能支持异步业务提交，又不把 Browser 变成 gameplay authority，也不要求 Schema Form 理解具体业务成功条件。
