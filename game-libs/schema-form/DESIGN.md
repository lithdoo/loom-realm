# Schema Form v1 Design

> 层级：`@loomrealm-game/schema-form` module / Presentation contract  
> 状态：Active / Normative / Frozen  
> 稳定程度：Frozen

本文定义 Schema Form v1 的 public declaration/API、canonical value/validation semantics、interaction lifetime、RenderData projection 与 browser Presentation contract。

Schema Form 是 caller 当前 Subsystem/Frame 内的一次性 game-lib interaction。它不注册独立 Subsystem，不通过 `frame.call()` 调用自己，也不拥有 submitted result 之后的 gameplay side effect。

## 1. Goals and module boundary

v1 schema 必须保持：

```text
JSON-compatible
small and explicit
deterministically validatable
presentation-neutral
independent from JSON Schema
free of layout/widget/provider/plugin schema extension frameworks
```

调用模型：

```text
current subsystem Frame
        │
        ├─ caller game logic
        │
        ├─ openSchemaForm(scope, frame, request)
        │    ├─ validate schema / initialValue
        │    ├─ create RenderDomain + InputListener
        │    ├─ maintain canonical form state/errors
        │    └─ submit / cancel / abort
        │
        └─ caller continues with result
```

Schema Form 直接复用 caller 的 `SubsystemScope`、`Frame.signal`、input authority 与 render ownership context。

不得把 public operation 实现为：

```ts
frame.call("schema-form", ...)
```

v1 不存在 `schemaFormDefinition`、Builder/Handler、独立 Frame 或独立 subsystem topology。

## 2. Public API

```ts
export type SchemaFormValueV1 = string | number | boolean;

export type SchemaFormDataV1 =
  Readonly<Record<string, SchemaFormValueV1>>;

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

export function openSchemaForm(
  scope: SubsystemScope,
  frame: Frame,
  request: SchemaFormRequestV1,
): Promise<SchemaFormResultV1>;
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

`cancelable` defaults to false：

```text
true
→ user-visible cancel controls may be shown
→ Escape requests cancel

false / undefined
→ no user cancellation settlement
→ Escape does not cancel
```

Frame abort is independent from user cancel.

## 3. Lifetime, concurrency and settlement

One interaction：

```text
open
→ edit / validate
→ submit or user cancel
→ resolve

Frame abort / validator-program failure / internal failure
→ reject
```

A `Frame` may have at most one active Schema Form：

```text
openSchemaForm(frame, A)
→ A active

openSchemaForm(frame, B) before A settles
→ reject B with SCHEMA_FORM_ALREADY_OPEN
→ create no B RenderDomain/InputListener/resources
→ do not disturb A
```

The registration is per Frame, not process-global.

All terminal paths share one settle-once cleanup path：

```text
successful submit
user cancel
Frame abort
validator/program failure
internal failure
        ↓
stop accepting form events
unsubscribe InputListener callback
close InputListener
close RenderDomain
remove Frame abort listener
release active-form registration
settle Promise exactly once
```

After settlement, duplicate/stale custom events are ignored.

### 3.1 User cancel vs Frame abort

```text
valid user cancel
→ cleanup
→ resolve { type: "cancelled" }

Frame abort
→ cleanup
→ reject error with name === "AbortError"
```

Frame abort must never be converted into `{ type: "cancelled" }`.

## 4. Schema declaration

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

`fields` is ordered; array order is default presentation order. Each field has a stable semantic `key`; submitted values are keyed by it.

```ts
interface SchemaFormFieldBaseV1 {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
  readonly required?: boolean;
}
```

### 4.1 String

```ts
export interface SchemaFormStringFieldV1 extends SchemaFormFieldBaseV1 {
  readonly kind: "string";
  readonly default?: string;
  readonly placeholder?: string;
  readonly multiline?: boolean;
  readonly minLength?: number;
  readonly maxLength?: number;
}
```

`multiline` is a presentation-neutral editing hint, not an HTML-control contract.

### 4.2 Number

```ts
export interface SchemaFormNumberFieldV1 extends SchemaFormFieldBaseV1 {
  readonly kind: "number";
  readonly default?: number;
  readonly min?: number;
  readonly max?: number;
  readonly integer?: boolean;
}
```

Only finite JSON-compatible numbers are legal. `integer` constrains the JSON number; it is not a separate value type.

### 4.3 Boolean

```ts
export interface SchemaFormBooleanFieldV1 extends SchemaFormFieldBaseV1 {
  readonly kind: "boolean";
  readonly default?: boolean;
}
```

Unchecked is ordinary `false`; v1 does not distinguish unset/null boolean from false.

### 4.4 Select

```ts
export interface SchemaFormSelectOptionV1 {
  readonly value: string;
  readonly label: string;
}

export interface SchemaFormSelectFieldV1 extends SchemaFormFieldBaseV1 {
  readonly kind: "select";
  readonly default?: string;
  readonly options: readonly SchemaFormSelectOptionV1[];
}

export type SchemaFormFieldV1 =
  | SchemaFormStringFieldV1
  | SchemaFormNumberFieldV1
  | SchemaFormBooleanFieldV1
  | SchemaFormSelectFieldV1;
```

`option.value` is semantic submitted value; `option.label` is presentation text. String-array shorthand is not part of v1.

## 5. Defaults, initial values and canonical value semantics

Defaults belong to reusable schema; invocation-specific initial values belong to `SchemaFormRequestV1`.

Precedence：

```text
initialValue[field.key]
→ field.default
→ field-kind empty value
```

Empty values：

```text
string  → ""
number  → absent
boolean → false
select  → absent
```

Therefore canonical outward value semantics are exact：

```text
string
→ always present string; "" is ordinary empty

boolean
→ always present true/false; unchecked=false

number
→ finite number when set; otherwise key absent

select
→ declared option.value when set; otherwise key absent
```

`false`, `0`, and `""` are explicit values and never mean absence.

For select Presentation, `null` is the only unset representation; every string including `""` is a possible semantic option value.

`required` semantics：

```text
string required
→ "" fails interactive validation
→ no implicit trim

boolean required
→ does not mean "must be checked"
→ boolean is always true or false

number/select required
→ unset fails interactive validation
```

`required` is interaction-time validation. A well-typed explicit default/initial empty value is not rejected merely because required would later fail user validation.

String `minLength`/`maxLength` use ECMAScript `value.length` (UTF-16 code units), not grapheme/code-point counts.

v1 performs no implicit trim, case folding, Unicode normalization, locale number conversion or other value normalization.

## 6. Schema validity and limits

Schema and initial value are preflight-validated before active-form resources are created.

Exact v1 limits：

```text
maximum fields                             128
maximum field.key UTF-8 bytes              128
maximum compact SchemaFormV1 JSON          65,536 bytes
maximum compact initialValue JSON          65,536 bytes
maximum compact validator error-map JSON   65,536 bytes
maximum Change/Submit event data           131,072 bytes
```

The 65,536-byte limits are Schema Form boundaries, intentionally below generic Render/User Input ceilings.

Rules：

```text
fields.length                  0..128
field.key                      valid Unicode, non-empty, unique, 1..128 UTF-8 bytes
other schema strings           valid Unicode; may be empty
validator error strings        non-empty

minLength/maxLength            non-negative integers; minLength <= maxLength
min/max                        finite; min <= max
integer=true                   default/initial number must be integer

select option.value            unique within field; may be ""
select default/initial         must match declared option.value
initialValue                   must not contain unknown keys
```

Field default and supplied initial value must match declared kind and built-in constraints except `required`.

An empty `validateOnChange`/`validateOnSubmit` string is structurally a string and then fails validator compilation as `SCHEMA_FORM_VALIDATOR_FAILED`; it is not a separate schema-shape error.

## 7. Trusted scripted validation

Optional validators：

```ts
readonly validateOnChange?: string;
readonly validateOnSubmit?: string;
```

Each string is a complete trusted JavaScript function expression, conceptually compiled as：

```ts
const validator = new Function(
  `"use strict"; return (${source});`,
)();
```

Validator input：

```ts
type SchemaFormValidationDataV1 = SchemaFormDataV1;
```

It receives a detached shallow-frozen snapshot of current canonical data. Mutation of validator input must never become an implicit state update.

Logical result：

```ts
type SchemaFormValidationErrorsV1 =
  Readonly<Record<string, string>>;

type SchemaFormValidatorResultV1 =
  | null
  | undefined
  | SchemaFormValidationErrorsV1;
```

Passing forms：

```text
null
undefined
{}
```

All normalize to one empty error map.

A non-empty object means field validation errors. Every key must name an existing field; every value must be a non-empty string. Invalid shapes are program/validator failure, not user validation errors.

After shape validation, non-null error map compact JSON must be <= 65,536 UTF-8 bytes.

### 7.1 Change validation

```text
accepted presentation change snapshot
→ construct canonical candidate
→ built-in validation
→ run validateOnChange(candidate)
→ merge errors
→ accept candidate even when errors exist
→ update retained field data/errors
```

Change validation errors do not roll back the value change.

### 7.2 Submit validation

```text
submit complete snapshot
→ construct canonical candidate independently
→ complete built-in validation
→ run validateOnSubmit(candidate)
→ errors: keep active and project errors
→ no errors: resolve submitted value and cleanup
```

Submit does not implicitly re-run `validateOnChange`; authors that need the same cross-field rule at both times declare it in both validators.

Merge precedence：

```text
built-in error wins for same field
scripted error fills fields without a built-in error
```

The scripted validator still runs when built-in errors exist, so it can return cross-field errors elsewhere.

### 7.3 Trust boundary

Validator strings are executable JavaScript. `SchemaFormV1` is therefore JSON-compatible in transport shape but **not safe as arbitrary untrusted configuration**.

Untrusted user/remote content must not be evaluated as `validateOnChange` / `validateOnSubmit` source.

## 8. Error contract and preflight ordering

```ts
export type SchemaFormErrorCode =
  | "SCHEMA_FORM_INVALID_SCHEMA"
  | "SCHEMA_FORM_INVALID_INITIAL_VALUE"
  | "SCHEMA_FORM_ALREADY_OPEN"
  | "SCHEMA_FORM_VALIDATOR_FAILED"
  | "SCHEMA_FORM_INVALID_VALIDATOR_RESULT";

export class SchemaFormError extends Error {
  readonly code: SchemaFormErrorCode;
  readonly path?: string;

  constructor(
    code: SchemaFormErrorCode,
    message: string = code,
    path?: string,
    options?: ErrorOptions,
  );
}
```

Mapping：

```text
invalid schema shape/declaration/default/constraint/schema budget
→ SCHEMA_FORM_INVALID_SCHEMA

unknown/wrong/invalid initial value
→ SCHEMA_FORM_INVALID_INITIAL_VALUE

second active form for same Frame
→ SCHEMA_FORM_ALREADY_OPEN

validator compilation/execution throws
→ SCHEMA_FORM_VALIDATOR_FAILED

validator returns invalid result shape/budget
→ SCHEMA_FORM_INVALID_VALIDATOR_RESULT
```

`SchemaFormError.name === "SchemaFormError"`.

Path rules：

```text
invalid concrete schema member
→ exact path, e.g. schema.fields[2].key
whole schema shape/version/size
→ "schema"

invalid concrete initial member
→ initialValue.<fieldKey>
whole initial object shape/size
→ "initialValue"

SCHEMA_FORM_ALREADY_OPEN
→ undefined

validator failure/result
→ "schema.validateOnChange" or "schema.validateOnSubmit"
```

Callers branch on `code`, not message text.

Preflight ordering：

```text
validate outer API shape
→ validate schema
→ validate initialValue against validated schema
→ check one-active-form-per-Frame
→ compile validators / establish session
→ create presentation/input resources
```

`openSchemaForm()` is `async`: invalid outer shape rejects with `TypeError`; schema/program preflight rejects with `SchemaFormError`; Frame abort rejects with `AbortError`. Preflight failure creates no active presentation/input resources.

Validator/program failure after opening uses normal settle-once cleanup.

## 9. Authoritative form state and projection

Authority split：

```text
caller
→ why form is opened
→ schema / initial input
→ gameplay meaning of submitted result

Schema Form session
→ canonical current data
→ validation errors
→ submit/cancel/abort lifecycle

Renderer Store
→ retained Render replica

business WebComponents
→ DOM/widget/focus/lexical-draft/visual-local state
```

Presentation is not validation authority and must not reinterpret original schema/default/initial values as a second canonical form state.

Flow：

```text
SchemaFormV1 + initialValue
→ Schema Form canonical state
→ RenderData projection
→ business WebComponents
```

## 10. Canonical Render Tree

One active form owns one RenderDomain：

```text
lr-schema-form
└─ lr-schema-form-field*
```

RenderNode keys are private interaction identity, not derived from potentially 128-byte semantic field keys.

Each open interaction allocates one process-local monotonic safe-integer serial `N`：

```text
root      sf:N
field 0   sf:N:f:0
field 1   sf:N:f:1
...
```

Serial is not reused during process lifetime; safe-integer exhaustion fails rather than wrapping identity.

The fixed RenderDomain z-index is：

```ts
const SCHEMA_FORM_Z_INDEX = 2_147_483_647;
```

v1 does not introduce an overlay/z-index allocator.

Conceptual projection：

```ts
{
  key: `sf:${N}`,
  tag: "lr-schema-form",
  attrs: {
    class:
      "wa-theme-default wa-palette-default " +
      "wa-brand-blue wa-neutral-gray " +
      "wa-success-green wa-warning-yellow wa-danger-red",
  },
  data: formRenderData,
  children: schema.fields.map((field, index) => ({
    key: `sf:${N}:f:${index}`,
    tag: "lr-schema-form-field",
    attrs: {},
    data: fieldRenderData,
    children: [],
  })),
}
```

Semantic `field.key` lives in field RenderData; child order expresses schema field order.

## 11. Root and field RenderData

Root：

```ts
export interface SchemaFormRenderDataV1 {
  readonly title?: string;
  readonly description?: string;
  readonly cancelable: boolean;
}
```

Field base：

```ts
interface SchemaFormFieldRenderBaseV1 {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
  readonly required: boolean;
  readonly error?: string;
}
```

Field union：

```text
string
→ kind, value:string, placeholder?, multiline:boolean, minLength?, maxLength?

number
→ kind, value?:number, min?, max?, integer:boolean

boolean
→ kind, value:boolean

select
→ kind, value?:string, options:{value,label}[]
```

Presence rules：

```text
string/boolean value always present
number/select value absent when canonical unset
```

When a number/select changes from set to unset, Render update removes the `value` member; it never encodes JavaScript `undefined` into JSON data.

Each field node receives only its own current error, not a form-global error map. WC does not receive validator source, defaults, initialValue or authority it would need to reinterpret.

## 12. Browser Presentation artifacts

Platform-neutral root module remains：

```text
@loomrealm-game/schema-form
```

It contains no DOM/Lit/Web Awesome runtime import.

Browser resources：

```text
@loomrealm-game/schema-form/browser/schema-form.browser.js
@loomrealm-game/schema-form/browser/schema-form.browser.css
```

Package metadata marks browser artifacts as side-effectful. The JS is a self-contained classic-script-compatible bundle that registers exactly：

```text
lr-schema-form
lr-schema-form-field
```

If either LoomRealm-owned tag is already registered, evaluation fails rather than replacing/accepting a foreign definition.

No public `registerSchemaFormElements()`, runtime `import()`, Renderer-window bare npm resolution, or Schema Form-specific loader exists. Web Presentation Config performs ordinary ordered bootstrap.

Authoring/build stack：

```text
Lit 3.3.3
Web Awesome 3.14.0
esbuild 0.25.9
```

Browser source type-imports formal `WebPresentationContext` only; emitted runtime bundle must not depend on Renderer module loading.

CSS imports only required Web Awesome theme/palette plus Schema Form CSS, not aggregate `webawesome.css`. Browser JS imports only required Web Awesome components and bundles them into the classic artifact.

The artifact claims Window-lifetime ownership of the Web Awesome tags it bundles; registration collision is a Web Presentation bootstrap failure.

## 13. Browser control mapping and modal semantics

Frozen control mapping：

```text
string + multiline=false → wa-input
string + multiline=true  → wa-textarea
number                    → wa-input, text editing, inputmode=decimal
boolean                   → wa-checkbox
select                    → wa-select + wa-option
form action               → wa-button
modal                     → wa-dialog
```

`wa-number-input` is intentionally not used; canonical number authority must not depend on third-party normalization of in-progress lexical text.

Schema Form is always modal in v1. `lr-schema-form` renders a semantic `<form novalidate>` inside `wa-dialog`; native/Web Awesome validity is not submission authority.

`wa-dialog` accessible label = current Schema Form title；title absent 时使用稳定、presentation-only 的 fallback accessible label `"Form"`，且该 fallback 不改变 RenderData。

Layout/scroll invariants：

```text
dialog preferred width   600px
dialog max width         80vw
shell max height         80vh
shell/body min width/height 0
header/footer fixed outside scrolling body
only form body owns vertical scrolling
horizontal form scrolling prohibited
body overscroll contained
RenderData refresh preserves body scroll through stable DOM
```

No `light-dismiss`. Every `wa-hide` is intercepted with `preventDefault()`：

```text
cancelable=true + hide request
→ preventDefault
→ semantic cancel event
→ Subsystem settles
→ RenderDomain closes
→ DOM removal

cancelable=false + hide request
→ preventDefault
→ emit nothing
→ remain open
```

Submit/Cancel buttons never directly close the dialog.

`wa-dialog` owns browser modality/focus containment/backdrop. `lr-schema-form` captures previous meaningful focus target and, after RenderDomain-driven removal, best-effort restores it only if still connected/visible/enabled/non-inert/focusable, using `focus({preventScroll:true})`.

Pointer/keyboard interaction handled by form Presentation is stopped before bubbling to Window-level physical input source. Gamepad/non-DOM suppression is outside v1.

## 14. Browser validity and stable editing DOM

Presentation consumes RenderData snapshots and validates an incoming complete snapshot before applying it. Invalid RenderData throws `TypeError` and preserves the last successfully applied browser state.

Schema Form constraints (`required`, `minLength`, `maxLength`, `min`, `max`, `integer`) are not delegated to browser/native/Web Awesome validity in a way that can independently block/normalize submission. Required is only a visual marker; authoritative errors come from field `error` RenderData.

Editing controls must remain stable across `receiveRenderData()` updates; replacing active controls on each update would destroy focus/selection/IME state.

Field `kind` does not change during one open form lifetime.

### 14.1 Select token mapping

`wa-select` remains clearable so unset is user-reachable. Browser empty value is reserved for unset. Semantic option values map to private stable tokens by index：

```text
option 0 → "o:0"
option 1 → "o:1"
...
```

Semantic `option.value` is never used directly as `wa-option.value`; this preserves semantic `option.value === ""` distinctly from browser unset.

### 14.2 Number lexical drafts

Number field uses presentation-local：

```ts
private draft: string;
private dirty: boolean;
```

Snapshot conversion：

```text
"" / "-" / "+" / "1." / "-1."
→ null

complete JSON-style decimal/exponent form
→ Number(draft), only if finite

other drafts
→ null
```

Complete lexical grammar：

```text
-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?
```

No trim, locale decimal/group conversion, or Unicode-number normalization.

Reconciliation：

```text
first RenderData
→ draft from authoritative value or ""
→ dirty=false

local number input
→ draft exact editor text
→ dirty=true

later RenderData while dirty=false
→ synchronize draft

later RenderData while dirty=true
→ never overwrite draft
→ only update errors/labels/constraints/other facts
```

Once dirty, it stays dirty for that field element lifetime. Incomplete draft/cursor/selection/composition are Presentation-local; canonical Schema Form number state remains finite number or absence.

## 15. Presentation edit snapshot

Only root `lr-schema-form` calls `WebPresentationContext.emitCustomEvent()`.

```text
lr-schema-form-field
→ local callback/method
→ lr-schema-form
→ emitCustomEvent
→ Renderer/User Input
→ Schema Form session
```

Field nodes do not emit Renderer custom events directly.

Outward names：

```text
change
submit
cancel
```

All originate from the current root node (`targetKey = rootKey`). Root key is the form-instance correlation token.

Change and Submit carry a complete current presentation snapshot：

```ts
export type SchemaFormPresentationValueV1 =
  | string
  | number
  | boolean
  | null;

export type SchemaFormPresentationValuesV1 =
  Readonly<Record<string, SchemaFormPresentationValueV1>>;
```

Mapping：

```text
string   → string
number   → finite number | null
boolean  → boolean
select   → string | null
```

Root snapshot contains **exactly one key for every schema field**. Missing/extra keys are malformed. Number/select unset use `null`; string/boolean always use concrete values.

A field notification is accepted only while `field.parentElement === root`; stale/foreign child notifications are ignored.

### 15.1 Change

```ts
context.emitCustomEvent("change", {
  values: this.collectValues(),
});
```

Change is a complete current snapshot, not a delta/command log. This lets later Change converge the Subsystem even if intermediate bounded User Input events drop.

v1 does not debounce/coalesce Change.

DOM trigger：

```text
single-line string input   → input
multiline string textarea  → input
number text input          → input
boolean checkbox           → change
select                     → change
```

Programmatic updates caused by `receiveRenderData()` must not emit Change.

### 15.2 Submit

Submit independently recollects a complete snapshot at the moment of attempt：

```ts
context.emitCustomEvent("submit", {
  values: this.collectValues(),
});
```

Correctness never depends on prior Change delivery.

Subsystem handling：

```text
validate exact snapshot
→ number/select null => canonical absence
→ other typed values => canonical candidate
→ built-in validation
→ validateOnSubmit
→ errors: update RenderData, remain open
→ valid: resolve submitted snapshot, close resources
```

WC never hides/removes itself on Submit; authoritative RenderDomain removal closes it.

### 15.3 Cancel

```ts
context.emitCustomEvent("cancel");
```

Used by header close, footer Cancel and Escape only when cancelable. WC never directly removes itself. Subsystem rechecks `request.cancelable` before resolving cancelled.

## 16. Event-size boundary and fail-closed consumption

Component-supplied Change/Submit `data` compact JSON UTF-8 size must be <= 131,072 bytes.

Browser preflight：

```text
oversize Change
→ keep local edit
→ emit nothing

over-size Submit
→ emit nothing
→ show presentation-local "Form data is too large"
→ clear that local message once snapshot returns within limit
```

Subsystem independently remeasures the same limit; browser check is UX containment, subsystem check is authoritative Schema Form boundary.

Schema Form listens on `WEB_PRESENTATION_EVENT_CHANNEL_V1` using the same caller Frame and accepts only the allocated `rootKey`.

Fail-closed rules：

```text
targetKey != active rootKey      → ignore
unknown event name               → ignore
malformed/oversize change/submit → ignore, zero state/error mutation
cancel when cancelable=false     → ignore
duplicate after settlement       → ignore
```

For Change/Submit, `data.values` must contain exactly the schema field-key set, legal presentation value types, finite numbers, and valid select values. Malformed presentation input does not create a new public `SchemaFormErrorCode`.

`domainId` remains generic Renderer provenance; it is not Schema Form semantic identity.

## 17. Current Web Presentation dependency

Schema Form consumes existing generic contracts：

```text
WebPresentationContext.emitCustomEvent(name, data)
→ Renderer-bound node provenance/currentness
→ x.loomrealm.web-presentation.event
→ User Input targeted delivery
→ caller Subsystem Frame listener
```

Normative platform references：

- [Web Presentation API v1](../../doc/15-contracts/web-presentation-api-v1.md)
- [User Input v1](../../doc/15-contracts/user-input-v1.md)
- [Render Update v1](../../doc/15-contracts/render-update-v1.md)

Schema Form does not add Renderer wire kinds, RenderDomain operations, InputListener priority, InputTarget authority, new Subsystem definitions or alternate `frame.call()` paths.

Modal browser event blocking is separate from semantic custom-event delivery; both remain within existing Presentation/Input architecture.

## 18. Explicit v1 exclusions

v1 does not define：

```text
JSON Schema compatibility / uiSchema
conditional visibility / dynamic fields
cross-field dependency declaration language
async validation
remote options
nested arbitrary objects / recursive arrays
widget registry
theme/layout DSL in schema
provider/plugin framework
computed fields
general-purpose scripting beyond the two trusted synchronous validators
arbitrary extension/metadata bags
multiple concurrent forms in one Frame
multi-page wizard
independent Schema Form subsystem
gameplay side effects after submit
```

These are outside v1 rather than implementation discretion.

## 19. Compatibility rule

The public request/result/error/model, validation/value semantics, event names/payload shapes, lifecycle, limits and Browser Presentation ABI in this document are the v1 compatibility surface.

Incompatible change requires an explicit contract change; private refactoring cannot reinterpret them.

Implementation status and qualification evidence come from current source/tests and repository qualification records. This contract does not contain implementation plans, agent instructions, progress checklists or roadmap state.