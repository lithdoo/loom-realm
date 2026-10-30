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

本文只定义后续实现的目标、API 语义、状态边界和验收条件。**本文不修改当前 Runtime、Browser bundle、Framework Contract、Conformance 或现有 Frozen v1 设计，也不声明功能已经实现或通过 qualification。**

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

```ts
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
```

`Promise<void>` 只用于描述 callback 的异步 lifetime 和异常传播；**Promise resolve 不表示 submit success**。

成功只能由：

```ts
control.close();
```

表达。

失败 / 继续编辑由 caller 显式执行，例如：

```ts
control.sendValidateError(errors);
control.cancelLoading();
```

### 4.2 Field localStorage declaration

Field base 增加：

```ts
interface SchemaFormFieldBaseV1 {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
  readonly required?: boolean;

  readonly localstorageKey?: string;
}
```

本文冻结 public property 拼写为 `localstorageKey`。

`localstorageKey` 是 Browser Presentation hint，不改变 field semantic key，也不是 Shared State / Content key。

---

## 5. Submit execution model

### 5.1 Legacy path

没有 `onSubmit` 时保持现有行为：

```text
submit
→ construct canonical candidate
→ built-in validation
→ validateOnSubmit
→ errors: keep open
→ no errors: resolve submitted + cleanup
```

这保证现有调用方无需迁移。

### 5.2 Caller-controlled path

配置 `onSubmit` 后：

```text
submit
→ construct canonical candidate
→ built-in validation
→ validateOnSubmit
→ errors
   → keep open
   → project retained field errors
→ no errors
   → snapshot candidate
   → invoke onSubmit(snapshot, control)
   → DO NOT auto-close
```

callback 的返回值和 Promise resolve 都不触发提交成功。

caller 必须显式选择后续动作：

```text
success
→ control.close()

failure
→ control.sendValidateError(...)
→ control.cancelLoading()
```

如果业务不需要异步操作，可以直接：

```ts
onSubmit(value, form) {
  persistSynchronously(value);
  form.close();
}
```

### 5.3 Async usage

推荐调用：

```ts
const result = await openSchemaForm(scope, frame, {
  schema,
  cancelable: true,

  onSubmit: async (value, form) => {
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
```

异步工作必须由 callback 返回/await 对应 Promise。不要启动 detached async work 后立即让 callback 返回。

---

## 6. Submit attempt lifetime 与 stale control

每次通过同步验证的 submit 分配一个 submit-attempt identity。

```text
attempt N accepted
→ create control N
→ invoke onSubmit
→ callback return / Promise settle
→ attempt N callback lifetime ends
```

要求：

- 同一 active callback lifetime 内的重复 submit 必须忽略；
- `loading=true` 时所有 `change` / `submit` / user `cancel` 输入在 Runtime 侧也必须拒绝或忽略；
- control 只对创建它的 current attempt 有效；
- form 已 settlement、Frame 已 abort、或已有更新 submit attempt 后，旧 control 调用不得重新安装旧 authority；
- stale control 的 UI mutation / `close()` / validation feedback 应安全 no-op，不得影响当前表单；
- caller 必须通过返回/await Promise 保持 control 的异步 lifetime。

`onSubmit` callback throw 或 returned Promise rejection 是 program / operation failure，不是 validation failure。后续实现应走统一 cleanup 并 reject `openSchemaForm()`，不得自动转换为 `cancelled` 或 validation error。

---

## 7. Loading 设计

### 7.1 Retained root attribute

Schema Form root RenderNode 增加 retained attribute：

```text
loading absent
→ not loading

loading="true"
→ loading
```

初始化时不设置 `loading`。

`setLoading()`：

```text
current submit control
→ RenderDomain.update(root attrs set loading="true")
→ Web Projector
→ <lr-schema-form loading="true">
```

`cancelLoading()`：

```text
current submit control
→ RenderDomain.update(root attrs remove loading)
→ <lr-schema-form>
```

Loading 是 Schema Form Runtime 持有的 retained presentation fact，不由 Browser 自行猜测。

### 7.2 Browser behavior

`<lr-schema-form loading="true">` 时必须：

- 禁用所有 `wa-input`；
- 禁用所有 `wa-textarea`；
- 禁用所有 `wa-checkbox`；
- 禁用所有 `wa-select`；
- 禁用 Submit button；
- Submit button 展示 loading progress；
- 禁用 Cancel button；
- 禁用 Close button；
- 拦截 dialog hide / Escape，不发 cancel；
- 不产生新的 change / submit / cancel custom event。

Loading 结束后恢复由当前 RenderData / `cancelable` 决定的正常交互状态。

### 7.3 Loading 与 cancelable

现有 `cancelable` 语义继续保留：

```text
cancelable=false
→ 用户任何时候都不能取消

cancelable=true + loading=false
→ 用户可以取消

cancelable=true + loading=true
→ 暂时不能取消
```

Frame abort 永远高于 Loading：

```text
Frame abort
→ cleanup
→ reject AbortError
```

Loading 不得阻止 Frame lifecycle termination。

### 7.4 setLoading / cancelLoading idempotence

后续实现应使：

```text
setLoading() while already loading
→ no additional semantic change

cancelLoading() while not loading
→ no additional semantic change
```

它们不表示业务成功或失败。

`cancelLoading()` 也**不取消 caller 自己的 Promise / fetch / operation**；异步取消仍由 caller 自己负责。

---

## 8. close() 语义

`close()` 是 caller-controlled submit path 中唯一成功 settlement 操作。

合法 `close()`：

```text
current attempt control.close()
→ mark submitted
→ submitted value = immutable snapshot that created this submit attempt
→ cleanup RenderDomain / event subscription / Frame abort listener / active registration
→ resolve {
     type: "submitted",
     value: submittedSnapshot
   }
```

`close()` 不等于 user cancel。

即使 Browser 在 async operation 期间发生 Presentation reload，成功值也必须来自 Runtime 保留的 submit snapshot，而不是重新读取 DOM。

---

## 9. Subsystem → WebComponent validation feedback

### 9.1 复用已有 Render Event

Framework 已经提供：

```text
RenderDomain.emit({ targetKey, name, data })
→ render.event
→ Renderer applicability/currentness gate
→ WebProjector live target lookup
→ receiveRenderEvent({ name, data })
```

因此本提案**不新增 Framework 协议**。

Schema Form root `lr-schema-form` 后续实现 `receiveRenderEvent()`，并定义 Schema Form-private event：

```text
name = "validate-error"
```

payload：

```ts
{
  errors: readonly {
    field: string;
    errorMsg: string;
  }[];
}
```

`sendValidateError(errors)` 负责：

1. 验证 `field` 必须存在于当前 schema；
2. `errorMsg` 必须为非空合法字符串；
3. 同一 payload 不允许重复 field；
4. 将 payload 通过当前 RenderDomain emit 到 root key。

### 9.2 Transient semantics

该 async/business validation feedback 明确定义为 **transient Presentation feedback**：

- 不进入 Renderer retained Store；
- 不进入 Shared State；
- 不修改 canonical form data；
- Renderer reload 后不 replay；
- target stale / removed 时允许按现有 Render Event Contract drop；
- Browser 只把它作为当前表单交互中的错误提示。

这与现有 built-in / scripted validation error 不同：

```text
built-in / validateOnChange / validateOnSubmit errors
→ Schema Form Runtime retained errors
→ RenderData

sendValidateError(...)
→ caller-driven transient business validation feedback
→ Render Event
```

如果未来业务要求 async validation error 在 Renderer reload 后继续存在，应另行设计 retained error path，而不是改变 Render Event 的 no-history 语义。

### 9.3 Browser clearing rule

Browser 收到 `validate-error` 后按 field 显示消息。

对应 field 下一次发生本地 edit 时：

```text
clear that field's transient external error
→ emit ordinary change snapshot
```

新一轮 submit 开始时应清除上一轮仍残留的 transient external errors，避免旧业务错误污染新 attempt。

---

## 10. localstorageKey 语义

### 10.1 定位

`localstorageKey` 只表示：

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

```text
explicit request.initialValue[field.key]
→ valid localStorage value
→ field.default
→ field-kind empty value
```

显式 `initialValue` 永远高于 Browser-local draft。

为了让 Browser 知道某 field 是否允许从 localStorage restore，后续内部 RenderData 可以增加 private projection metadata；不要求把 `initialValue` 本身暴露给 WebComponent。

### 10.3 Storage encoding

每个 `localstorageKey` 保存一个 JSON primitive：

```text
string  → JSON string
number  → finite JSON number
boolean → JSON boolean
number/select unset → JSON null
```

读取时：

- `localStorage.getItem(key) === null` 表示不存在；
- JSON parse failure → ignore；
- type 与 field 不符 → ignore；
- number 非 finite → ignore；
- select value 不属于当前 options → ignore；
- storage API throw → ignore，并继续正常打开表单。

无效 storage 数据不得导致 `openSchemaForm()` reject。

### 10.4 Restore → Runtime authority

localStorage 是 Browser source，不是 canonical authority。

Browser 恢复值后必须通过普通 Web Presentation → Subsystem input path，把完整 candidate 送回 Schema Form Runtime；Runtime 仍使用当前 schema 对 candidate 做结构和类型检查，最终 canonical state 仍由 Schema Form Session 持有。

不得让 DOM/localStorage value 在没有 Runtime acceptance 的情况下成为 gameplay authoritative value。

实现允许复用一次普通 `change` snapshot 完成初始 restore；具体时序必须保证：

- explicit initialValue 不被覆盖；
- 用户可交互前不会产生多个重复 restore；
- invalid localStorage 不污染 canonical state；
- restore 不绕过现有 candidate validation。

### 10.5 Submit-time persistence

`localstorageKey` 的保存时点固定为：

```text
Browser user submit attempt
→ collect complete current presentation snapshot
→ best-effort write configured localStorage fields
→ emit submit custom event
```

因此，即使后续：

- built-in validation 失败；
- `validateOnSubmit` 失败；
- async business validation 失败；
- caller `cancelLoading()`；

最近一次 submit attempt 仍可成为下次打开时的 Browser-local draft。

这是刻意选择：`localstorageKey` 表达“记住玩家最近尝试提交的输入”，**不表达“业务提交已经成功”**。

如果产品需要“只有业务成功才持久化”，应由 caller 的业务 persistence 负责，而不是复用该 field hint。

### 10.6 Duplicate keys

同一个 SchemaFormV1 内多个 fields 不得声明相同的非空 `localstorageKey`。

否则无法定义一个 Browser key 对多个不同 field kind/value 的稳定恢复语义。

---

## 11. Browser Presentation changes

后续实现预计只扩展现有两个组件：

```text
lr-schema-form
lr-schema-form-field
```

### lr-schema-form

新增职责：

- consume retained `loading` attr；
- loading 时统一禁用 action；
- loading 时阻止 cancel / hide；
- implement `receiveRenderEvent()`；
- handle `validate-error`；
- coordinate one-shot localStorage restore；
- submit 前触发 localStorage save；
- 清理 transient external errors。

### lr-schema-form-field

新增职责：

- consume field `localstorageKey` projection metadata；
- expose/load Browser-local draft value under root coordination；
- loading 时 concrete control disabled；
- display transient external validation error；
- field edit 清除自己的 transient external error。

现有 stable editing DOM、number lexical draft、select private token mapping、focus restoration 等规则必须保持。

---

## 12. Validation compatibility

现有 validation 顺序保持：

```text
schema preflight
→ initialValue preflight
→ compile validators

change
→ candidate
→ built-in
→ validateOnChange
→ retained errors

submit
→ candidate
→ built-in
→ validateOnSubmit
→ if no errors:
     legacy path OR caller-controlled onSubmit
```

本提案不让 `onSubmit` 替代现有 schema validation。

推荐边界：

```text
Schema validation
→ 类型、required、范围、schema-known cross-field rules

onSubmit
→ 网络/账户/库存/权限/服务端/业务状态等异步验证与保存
```

---

## 13. Failure semantics

后续实现必须区分：

```text
ordinary user validation failure
→ keep form active

sendValidateError
→ transient Presentation feedback

onSubmit throw / Promise reject
→ program / operation failure
→ cleanup + reject openSchemaForm

Frame abort
→ cleanup + AbortError

Browser localStorage failure
→ presentation-local best effort failure
→ form remains usable

Render Event dropped due stale target
→ no Runtime rollback
```

不得把 program failure 自动转换成 `{ type: "cancelled" }`。

---

## 14. Compatibility

本改造目标是 source-compatible extension：

- `onSubmit` optional；
- `localstorageKey` optional；
- `loading` absent = false；
- `cancelable` 默认值继续为 false；
- 没有 `onSubmit` 的表单继续同步自动提交；
- 现有 field kind / value semantics 不变；
- 现有 `validateOnChange` / `validateOnSubmit` 不变；
- 不修改 Web Presentation API v1 或 Render Update v1 identity；
- 只复用现有 Render Event capability。

当前 `DESIGN.md` 仍是已实现 v1 的 Frozen SSOT。实现合并前，应根据最终代码决定是：

1. 将本文批准的条款合并回 `DESIGN.md` 并更新其状态；或
2. 以明确的有限 override 文档继续维护。

不得在只有本提案、没有实现时把当前 v1 标记为已实现这些能力。

---

## 15. 后续实现范围

预计实现只涉及 Schema Form game-lib 与其 qualification：

```text
game-libs/schema-form/src/model.ts
game-libs/schema-form/src/internal/session.ts
game-libs/schema-form/src/internal/validation.ts
game-libs/schema-form/browser/schema-form.browser.ts
game-libs/schema-form/test/*
test/schema-form-v1/*
```

仅当实现证明现有 Framework 行为不足时，才允许另开设计评审讨论 Framework Contract；本提案本身不授权修改 Framework。

---

## 16. 最低验收条件

后续代码 PR 至少必须证明：

1. 未配置 `onSubmit` 的现有 submit 行为不变；
2. 配置 `onSubmit` 后，同步 validation 成功不会自动关闭；
3. callback Promise resolve 不等于成功；
4. `close()` 才 resolve `submitted`；
5. `close()` 返回本次 submit snapshot，而不是重新读取 Browser DOM；
6. `setLoading()` 产生 retained root `loading="true"`；
7. loading 时所有字段、Submit、Cancel、Close 都不可交互；
8. loading 时 Browser 不发 change / submit / cancel，Runtime 也拒绝 stale 输入；
9. `cancelLoading()` 恢复交互且不表示取消异步操作；
10. `cancelable=false` 继续禁止取消；
11. `cancelable=true + loading=true` 暂时禁止取消；
12. Frame abort 在 loading 中仍立即终止并 reject `AbortError`；
13. duplicate submit 不产生并发 callback；
14. stale submit control 不能关闭或修改后续 attempt；
15. `sendValidateError()` 使用现有 Render Event path；
16. unknown field / duplicate field / empty errorMsg 的 external validation payload 被拒绝；
17. Browser 正确显示并在 field edit / next attempt 清理 transient external errors；
18. Renderer reload 不错误 replay transient validation Render Event；
19. explicit initialValue 高于 localStorage；
20. valid localStorage draft 可恢复并回流 Runtime canonical state；
21. invalid / unavailable localStorage 不影响表单打开；
22. submit attempt 在发出 submit event 前 best-effort 更新 localStorage；
23. failed async validation 后 localStorage 仍保留最近一次 submit-attempt draft；
24. string `""`、number `0`、boolean `false`、select value 与 unset `null` round-trip 正确；
25. duplicate `localstorageKey` schema 被拒绝；
26. real Chromium qualification 覆盖 loading、async failure、async success、cancelability、Render Event error 与 localStorage reopen round-trip；
27. 当前 Schema Form tests 和 repository affected CI 全部通过。

---

## 17. 实现建议顺序

建议后续代码按以下顺序落地：

```text
Phase 1
→ public types + schema validation for localstorageKey

Phase 2
→ submit attempt + onSubmit + control lifetime

Phase 3
→ retained loading attr + Browser disabled/loading behavior

Phase 4
→ validate-error Render Event + transient browser errors

Phase 5
→ localStorage restore/save semantics

Phase 6
→ unit/browser/real Chromium qualification

Phase 7
→ synchronize DESIGN.md / README current facts
```

每一阶段必须保持现有 legacy submit path 可用，最终代码 PR 才能声明本提案实现完成。

---

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
