# Schema Form v1 Design

> 层级：`@loomrealm-game/schema-form` module contract  
> 状态：Active / Normative / Frozen  
> 稳定程度：Frozen

本文定义 Schema Form v1 的 public model、module lifetime、validation boundary 与 Presentation interaction contract。

Schema Form 是 caller 当前 Subsystem/Frame 内的一次性 game-lib interaction。它不注册独立 Subsystem，不通过 `frame.call()` 调用自己，也不拥有 caller 后续 gameplay side effect。

## 1. Module boundary

```text
current subsystem Frame
        │
        ├─ caller game logic
        │
        ├─ openSchemaForm(scope, frame, request)
        │    ├─ validate schema / initial value
        │    ├─ create RenderDomain
        │    ├─ create InputListener
        │    ├─ maintain current form value/errors
        │    └─ submit / cancel / abort
        │
        └─ caller continues with result
```

Schema Form 共享 caller 的：

```text
Frame lifetime / abort signal
Subsystem input authority
Render ownership context
```

它不得为 public operation 创建第二个 Frame 或隐藏的 subsystem topology。

## 2. Public API

Root export：

```ts
export function openSchemaForm(
  scope: SubsystemScope,
  frame: Frame,
  request: SchemaFormRequestV1,
): Promise<SchemaFormResultV1>;
```

Public request/result：

```ts
export interface SchemaFormRequestV1 {
  readonly schema: SchemaFormV1;
  readonly initialValue?: SchemaFormDataV1;
  readonly cancelable?: boolean;
}

export type SchemaFormResultV1 =
  | {
      readonly type: "submitted";
      readonly value: SchemaFormDataV1;
    }
  | {
      readonly type: "cancelled";
    };
```

`SchemaFormDataV1` 是：

```ts
type SchemaFormValueV1 = string | number | boolean;
type SchemaFormDataV1 = Readonly<Record<string, SchemaFormValueV1>>;
```

Typical usage：

```ts
const result = await openSchemaForm(scope, frame, {
  schema,
  initialValue,
  cancelable: true,
});

if (result.type === "submitted") {
  use(result.value);
}
```

## 3. Schema model

```ts
export interface SchemaFormV1 {
  readonly version: 1;
  readonly title?: string;
  readonly description?: string;
  readonly fields: readonly SchemaFormFieldV1[];
  readonly validateOnChange?: string;
  readonly validateOnSubmit?: string;
}
```

v1 field kinds：

```text
string
number
boolean
select
```

Common field facts：

```text
key
label
description?
required?
```

String field additionally supports：

```text
default?
placeholder?
multiline?
minLength?
maxLength?
```

Number field：

```text
default?
min?
max?
integer?
```

Boolean field：

```text
default?
```

Select field：

```text
default?
options: { value, label }[]
```

Schema Form v1 intentionally does not adopt JSON Schema and does not define layout/widget/theme/provider extension frameworks as part of the schema.

## 4. Validation

Schema、initial value、Presentation event candidate data 与 validator result 都必须在被接受前验证。

Built-in field constraints 与 configured synchronous validator result 合并为 current field errors。Submit 仅在最终 error set 为空时成功。

Validation failure categories use the exported `SchemaFormError` contract：

```ts
type SchemaFormErrorCode =
  | "SCHEMA_FORM_INVALID_SCHEMA"
  | "SCHEMA_FORM_INVALID_INITIAL_VALUE"
  | "SCHEMA_FORM_ALREADY_OPEN"
  | "SCHEMA_FORM_VALIDATOR_FAILED"
  | "SCHEMA_FORM_INVALID_VALIDATOR_RESULT";
```

```ts
class SchemaFormError extends Error {
  readonly code: SchemaFormErrorCode;
  readonly path?: string;
}
```

Validator execution is synchronous from the Schema Form interaction perspective. Validation does not create a remote authority, async workflow or secondary Runtime.

## 5. Initial value and canonical form data

`initialValue` is invocation-specific data, not part of `SchemaFormV1`.

The module validates it against field identities/kinds and derives one canonical current form value from schema defaults + accepted initial input.

The current canonical value is owned by the active Schema Form interaction until terminal settlement. Caller receives a readonly submitted snapshot only after successful submit.

## 6. Concurrency and lifetime

There can be at most one active Schema Form per `Frame`.

```text
openSchemaForm(frame, A)
→ A active

openSchemaForm(frame, B) before A settles
→ reject/fail with SCHEMA_FORM_ALREADY_OPEN
→ B creates no second active form
```

This rule is per Frame, not process-global.

All terminal paths settle exactly once and run one best-effort cleanup path：

```text
successful submit
user cancel
Frame abort
validator failure
internal module failure
        ↓
stop accepting form events
unsubscribe / close InputListener
close RenderDomain
remove abort listener
remove active-form registration
settle Promise once
```

## 7. Cancel and Frame abort

`cancelable` defaults to false.

```text
cancelable=true
→ Presentation may expose cancel controls
→ valid cancel custom event resolves { type: "cancelled" }

cancelable=false/undefined
→ user cancel does not settle the form
```

Frame abort is never converted to user cancellation：

```text
user cancel
→ resolve { type: "cancelled" }

frame.signal abort
→ cleanup
→ reject with AbortError semantics
```

Observable abort error name：

```text
AbortError
```

## 8. Render Tree

An active form owns one RenderDomain. Canonical tree：

```text
lr-schema-form
└─ lr-schema-form-field*
```

Each interaction allocates fresh keys under its own form serial：

```text
sf:<serial>
sf:<serial>:f:<index>
```

Root retained `data` carries：

```text
title?
description?
cancelable
```

Each field node retained `data` carries the normalized field Presentation facts, current canonical value and current validation error when present.

The module publishes full retained facts through RenderDomain state/update semantics; it does not encode one-shot commands inside retained data.

## 9. Web Presentation interaction

Schema Form uses [Web Presentation API v1](../../doc/15-contracts/web-presentation-api-v1.md) reverse custom events on the reserved Web Presentation input channel.

Only events targeted to the current form root belong to the active interaction.

Canonical business event names：

```text
change
submit
cancel
```

`change` and `submit` carry a candidate form value object. The module revalidates event data against the current schema before accepting it.

`cancel` is legal only when the request is cancelable and its event data is the expected empty payload.

Unknown event names, wrong target keys or invalid candidate payloads do not become accepted business mutations.

Browser-specific DOM controls, input widgets and visual layout are Presentation implementation details; they do not become Subsystem authority.

## 10. Retained state and authority

```text
caller
→ owns why the form is opened
→ owns what submitted result means to gameplay
→ owns all post-submit side effects

Schema Form active session
→ owns current canonical form value
→ owns current validation errors
→ owns form interaction lifecycle

Renderer Store
→ owns current retained Render replica

business WebComponent
→ owns DOM/widget/focus/visual-local state
```

Presentation never directly mutates gameplay authority. A WC custom event is only an input proposal; Schema Form revalidates it before current form state changes or submission settles.

## 11. Public Presentation data types

The package exports the render-facing structural types used by compatible Presentation implementations：

```text
SchemaFormRenderDataV1
SchemaFormFieldRenderDataV1
SchemaFormPresentationValueV1
SchemaFormPresentationValuesV1
```

These types describe the current v1 Presentation data ABI. Consumers should not infer hidden module state from DOM implementation details.

## 12. Non-goals

Schema Form v1 does not define：

```text
independent Schema Form subsystem
frame.call-based service
JSON Schema compatibility layer
async/remote validation workflow
layout DSL
widget/plugin registry
theme/provider framework
multi-page wizard
nested forms
multiple concurrent forms in one Frame
gameplay side effects after submit
```

These are outside the v1 contract, not implementation discretion.

## 13. Compatibility rule

The v1 public request/result/error/model and Presentation interaction described here are the current contract. Incompatible changes to field identities/kinds, result semantics, event names/payloads, lifecycle or error classification require an explicit contract change rather than implementation-local reinterpretation.

Implementation status and qualification evidence come from current source/tests and repository qualification records; they are not duplicated as progress text in this contract.