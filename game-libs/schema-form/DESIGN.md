# Schema Form Design

Status: **Frozen / AI implementation-ready / no design discretion**

This document defines the v1 form declaration shape and public module boundary for
`@loomrealm-game/schema-form`.

Schema Form is a game-lib module that runs inside the caller's current subsystem
Frame. It is not an independently registered subsystem and is not invoked through
`frame.call()`.

This document focuses on the declarative form schema, the synchronous validation
contract, and the module-facing API. Renderer-specific implementation details remain
separate.

## Goals

The v1 schema should be:

- JSON-compatible.
- Small and explicit.
- Easy to validate deterministically.
- Presentation-neutral.
- Independent from JSON Schema.
- Free of layout, widget, provider, theme, and extension frameworks.

The schema describes fields and validation rules. Invocation-specific values are not
part of the schema.

## Module boundary

Schema Form is a reusable module owned by the currently executing subsystem.

The caller supplies its existing `SubsystemScope` and `Frame`. Schema Form uses
those capabilities directly for the duration of the form interaction.

Conceptually:

```text
current subsystem Frame
        │
        ├── game logic
        │
        ├── openSchemaForm(scope, frame, request)
        │       ├── render form
        │       ├── receive form input
        │       ├── maintain form data
        │       ├── validate
        │       └── submit / cancel
        │
        └── continue game logic with result
```

Schema Form does not create or register another subsystem Frame.

In particular, the module must not implement its public operation by calling:

```ts
frame.call("schema-form", ...)
```

There is no `schemaFormDefinition` in the v1 public API.

The module shares the caller's existing Frame lifetime, abort signal, input authority,
and render ownership context.

## Public API

The v1 module API is intentionally one-shot:

```ts
export type SchemaFormValueV1 =
  | string
  | number
  | boolean;

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

Typical usage:

```ts
const result = await openSchemaForm(scope, frame, {
  schema,
  initialValue,
  cancelable: true,
});

if (result.type === "submitted") {
  // consume result.value
}
```

The public function is a convenience module API, not a service locator and not a
wrapper around `frame.call()`.

`cancelable` controls whether the user may actively dismiss the form.

```text
cancelable === true
→ header close control is available
→ footer Cancel control is available
→ Escape requests cancel

cancelable === false | undefined
→ no user-visible cancel controls
→ Escape does not cancel
```

The default is non-cancelable. Frame cancellation/abort remains distinct from a user
cancel action.

### Frame abort and cleanup

`openSchemaForm()` is bound to the supplied Frame lifetime.

If `frame.signal` aborts while the form is still open, Schema Form must terminate
the interaction immediately.

The presentation effect is similar to user cancellation because the visible form is
removed and all form-owned resources are released, but the business result is
different:

```text
user Cancel
→ close form resources
→ resolve { type: "cancelled" }

Frame abort
→ close form resources
→ reject with AbortError
```

Frame abort must never be converted into a user-cancel result.

The rejected error must have:

```text
name = "AbortError"
```

An implementation may use the platform `DOMException` AbortError or an equivalent
Error object with the same observable name.

All terminal paths use one settle-once cleanup path:

```text
submitted successfully
user cancelled
Frame aborted
validator/program failure
internal module failure
        ↓
stop accepting further form events
close InputListener
close RenderDomain
remove abort listener / owned callbacks
settle openSchemaForm() exactly once
```

After terminal settlement, duplicate Submit/Cancel/custom events are ignored.

A Builder/Handler abstraction is intentionally not introduced in v1. The interaction
has a simple one-shot lifetime:

```text
open → edit → submit/cancel → resolve
            ↘ Frame abort/failure → reject
```

If future requirements introduce a persistent control surface that survives beyond
one interaction, that API shape can be reconsidered separately.

### One active form per Frame

Schema Form v1 allows at most one active `openSchemaForm()` interaction for the same
Frame at a time.

Opening a second form while another Schema Form is still active for that Frame rejects
the returned Promise before creating any second-form resource with:

```text
SCHEMA_FORM_ALREADY_OPEN
```

This avoids introducing modal stacking, competing focus traps, or Escape-key ordering
semantics in v1.

The active-form registration is released by the same settle-once cleanup path used by
submit, user cancel, Frame abort, and failures.

## Top-level schema

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

`fields` is an ordered array. Array order is the default presentation order.

Each field has a stable `key`. Submitted values are mapped by that key.

## Field model

```ts
export type SchemaFormFieldV1 =
  | SchemaFormStringFieldV1
  | SchemaFormNumberFieldV1
  | SchemaFormBooleanFieldV1
  | SchemaFormSelectFieldV1;

interface SchemaFormFieldBaseV1 {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
  readonly required?: boolean;
}
```

The discriminant is named `kind` rather than `type` to make it explicit that this
is a Schema Form field model, not JSON Schema.

### String field

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

`multiline` is a presentation-neutral editing hint. It does not imply any HTML or
DOM control.

### Number field

```ts
export interface SchemaFormNumberFieldV1 extends SchemaFormFieldBaseV1 {
  readonly kind: "number";

  readonly default?: number;

  readonly min?: number;
  readonly max?: number;
  readonly integer?: boolean;
}
```

`integer` is a constraint on a JSON number, not a separate value type.

Only finite JSON-compatible numbers are valid values.

### Boolean field

```ts
export interface SchemaFormBooleanFieldV1 extends SchemaFormFieldBaseV1 {
  readonly kind: "boolean";

  readonly default?: boolean;
}
```

`false` is the ordinary unchecked value. Boolean fields do not distinguish
`null`/unset from `false` in v1.

### Select field

```ts
export interface SchemaFormSelectFieldV1 extends SchemaFormFieldBaseV1 {
  readonly kind: "select";

  readonly default?: string;
  readonly options: readonly SchemaFormSelectOptionV1[];
}

export interface SchemaFormSelectOptionV1 {
  readonly value: string;
  readonly label: string;
}
```

`option.value` is the semantic value returned by the form.
`option.label` is presentation-only text.

Select options have one canonical representation. String-array shorthand is not
supported in v1.

## Defaults and initial values

Defaults belong to the reusable schema.

Invocation-specific initial values belong to the request that opens the form and are
kept separate from the schema.

The value precedence is:

```text
initialValue[field.key]
    ↓
field.default
    ↓
field-kind empty value
```

The v1 field-kind empty values are:

```text
string  → ""
number  → absent
boolean → false
select  → absent
```

Therefore an absent initial/default string is presented as an empty string and an
absent initial/default checkbox is presented as unchecked/false.

No additional `initial`, `value`, or `defaultValue` aliases are defined in v1.

## Value semantics

Submitted form data is a plain object keyed by field key and contains only
`string | number | boolean` values.

Example:

```json
{
  "name": "Alice",
  "level": 10,
  "enabled": false,
  "class": "mage"
}
```

String and boolean fields always have an outward value once the form is presented:

```text
string   → string
boolean  → true | false
```

For string fields, `""` is the ordinary empty value. If `required=true`, `""`
fails required validation. Schema Form does not trim before applying this rule.

For boolean fields, unchecked means `false`. Schema Form does not distinguish an
unset checkbox from `false`. `required` does not mean "must be checked"; boolean
fields are already present as either `true` or `false`.

Number and select fields may be unset. Unset number/select fields are omitted from
canonical `SchemaFormDataV1`.

The following values are explicit values and must never be treated as absence:

```text
false
0
""
```

For select fields, `null` is the only presentation representation of unset.
Every string, including `""`, is an explicit select value and must exactly match one
declared `options[*].value`. Schema Form does not reserve the empty string as a
select sentinel.

For string fields, `minLength` and `maxLength` use ECMAScript `value.length`
semantics (UTF-16 code units). v1 does not perform grapheme segmentation or Unicode
code-point counting.

`required` is an interaction-time validation rule. It does not make an otherwise
well-typed explicit default or `initialValue` invalid during preflight merely
because that value is empty/unset. This keeps explicit empty values equivalent to
the same empty values reached through fallback initialization.

Schema Form does not perform implicit trimming, case folding, Unicode normalization,
locale number conversion, or other value normalization in v1.

## Schema validity and limits

Schema Form validates the schema and `initialValue` before opening Presentation.

Validation failures use the public preflight error codes:

```text
invalid SchemaFormV1
→ SCHEMA_FORM_INVALID_SCHEMA

invalid initialValue
→ SCHEMA_FORM_INVALID_INITIAL_VALUE
```

These are configuration/program errors, not user field-validation errors. They reject
`openSchemaForm()` and never render field error messages.

The v1 limits are:

```text
maximum fields                           128
maximum field.key UTF-8 bytes            128
maximum compact SchemaFormV1 JSON        65,536 bytes
maximum compact initialValue JSON        65,536 bytes
maximum compact validator error-map JSON 65,536 bytes
maximum Change/Submit event data         131,072 bytes
```

The three 65,536-byte limits are Schema Form preflight/program boundaries, not
generic LoomRealm transport limits. They deliberately keep valid Schema Form
metadata, initial canonical data, and validator-produced presentation errors well
inside the existing RenderData/Render-message ceilings.

`SchemaFormV1` and `initialValue` byte counts use compact JSON UTF-8 encoding of
their complete validated objects. Validator error-map size is measured after result
shape validation but before accepting it as current validation state.

`field.key` must be a non-empty valid Unicode string and unique within the form.

String constraints must satisfy:

```text
minLength / maxLength are non-negative integers
minLength <= maxLength when both are present
```

Number constraints and defaults must use finite JSON-compatible numbers and satisfy:

```text
min <= max when both are present
integer=true → default/initial number must be an integer
```

Every field default and every supplied `initialValue[field.key]` must match the
declared field kind and all built-in constraints except `required`. The `required`
rule is evaluated only for interactive Change/Submit validation.

Declaration cardinality and string rules are exact:

```text
fields.length                  0..128
select.options.length          0..unbounded-by-count
                               (bounded only by the 65,536-byte schema budget)
field.key                      non-empty, valid Unicode, 1..128 UTF-8 bytes
all other schema strings       valid Unicode and MAY be ""
validator error strings        non-empty
```

An empty `validateOnChange` / `validateOnSubmit` string is structurally a string,
then fails validator compilation as `SCHEMA_FORM_VALIDATOR_FAILED`; it is not an
invalid schema-shape special case.

Select rules are:

```text
option.value values are unique
option.value may be ""
default, when present, matches one option.value
initialValue, when present, matches one option.value
```

`initialValue` must not contain unknown field keys.

For Change and Submit, the complete component-supplied custom-event data object
(`{ values: ... }`) must have compact JSON UTF-8 size <= 131,072 bytes (128 KiB).
The browser root performs this check before calling `emitCustomEvent()`. Oversize
Change snapshots remain local and are not emitted; an oversize Submit also remains
local and displays the presentation-local form-size error defined below. The
subsystem repeats the same bound check for every current-root Change/Submit event
before parsing it. The lower limit intentionally leaves room below the generic User
Input transport hard limit.

## Trusted scripted validation

Schema Form supports two optional synchronous scripted validators:

```ts
readonly validateOnChange?: string;
readonly validateOnSubmit?: string;
```

Each string contains a complete JavaScript function expression.

Example:

```json
{
  "validateOnChange": "(data) => data.password && data.password.length < 8 ? { password: 'At least 8 characters' } : null",
  "validateOnSubmit": "(data) => data.password !== data.confirmPassword ? { confirmPassword: 'Passwords do not match' } : null"
}
```

Conceptually the source is compiled as:

```ts
const validator = new Function(
  `"use strict"; return (${source});`,
)();
```

A validator receives the current form data snapshot:

```ts
type SchemaFormValidationDataV1 = SchemaFormDataV1;
```

Its logical result shape is:

```ts
type SchemaFormValidationErrorsV1 =
  Readonly<Record<string, string>>;

type SchemaFormValidatorResultV1 =
  | null
  | undefined
  | SchemaFormValidationErrorsV1;
```

### Passing result

The following results mean validation passed:

```ts
null
undefined
{}
```

Internally all three passing forms MUST normalize to one empty error map.

### Failing result

A non-empty object means validation failed:

```ts
{
  password: "Password is too short",
  confirmPassword: "Passwords do not match"
}
```

Every object key must match an existing `fields[*].key`.

Every object value must be a non-empty string describing the validation failure for
that field.

The following results are invalid validator results:

```ts
"error"
false
[]
{ password: 123 }
{ unknownField: "Invalid" }
```

An invalid validator result is a validator failure, not a user validation failure.

After structural result validation, the compact JSON UTF-8 encoding of a non-null
validator error map must be <= 65,536 bytes. Exceeding that bound is
`SCHEMA_FORM_INVALID_VALIDATOR_RESULT`. This prevents a trusted validator from
turning an otherwise valid interaction into an oversized RenderData update.

## Change validation

`validateOnChange` runs after the authoritative form value has changed.

Its purpose is to recompute the current validation state.

A validation error must not reject or roll back the field change. The value change
remains accepted, and the returned errors are shown as the current validation state.

Conceptually:

```text
field change
    ↓
update canonical form data
    ↓
run built-in field validation
    ↓
run validateOnChange(data)
    ↓
update validation errors
    ↓
refresh presentation
```

## Submit validation

`validateOnSubmit` runs when submission is attempted.

Conceptually:

```text
submit attempt
    ↓
run complete built-in validation
    ↓
run validateOnSubmit(data)
    ↓
errors exist → remain active
no errors    → complete submission
```

In v1, `validateOnChange` and `validateOnSubmit` have independent execution
semantics. A submit does not implicitly re-run `validateOnChange`.

If the same cross-field rule must run at both times, the schema author must declare
it in both validators.

Built-in and scripted validation results are merged deterministically:

```text
built-in error wins for the same field
scripted error fills only fields without a built-in error
```

The scripted validator still runs when built-in errors already exist so it can
produce cross-field errors for other fields. A scripted validator cannot hide a
built-in declaration constraint.

## Validator failure

Validator/program failures reject `openSchemaForm()`; they are never converted into
ordinary field validation errors.

The public error contract is:

```ts
export type SchemaFormErrorCode =
  | "SCHEMA_FORM_INVALID_SCHEMA"
  | "SCHEMA_FORM_INVALID_INITIAL_VALUE"
  | "SCHEMA_FORM_ALREADY_OPEN"
  | "SCHEMA_FORM_VALIDATOR_FAILED"
  | "SCHEMA_FORM_INVALID_VALIDATOR_RESULT";

export class SchemaFormError extends Error {
  constructor(
    code: SchemaFormErrorCode,
    message: string = code,
    path?: string,
    options?: ErrorOptions,
  );

  readonly code: SchemaFormErrorCode;
  readonly path?: string;
}
```

The code mapping is:

```text
schema shape, field declaration, constraint, default, or schema limit is invalid
→ SCHEMA_FORM_INVALID_SCHEMA

initialValue contains an unknown key, wrong value type, invalid select value,
non-finite number, or violates a declared field constraint
→ SCHEMA_FORM_INVALID_INITIAL_VALUE

second active form for same Frame
→ SCHEMA_FORM_ALREADY_OPEN

validator compilation or execution throws
→ SCHEMA_FORM_VALIDATOR_FAILED

validator returns an invalid result shape
→ SCHEMA_FORM_INVALID_VALIDATOR_RESULT
```

Schema and initial-value validation are preflight checks. They run before Schema Form
creates a RenderDomain, InputListener, abort subscription, or active-form registration.

`openSchemaForm()` has one failure surface: it always returns a Promise and never
reports argument/preflight failures by a synchronous throw. Invalid outer API shape
rejects that Promise with `TypeError`; Schema Form preflight/program failures reject
it with the documented `SchemaFormError`; Frame abort rejects it with `AbortError`.

Therefore:

```text
invalid schema / initialValue
→ reject SchemaFormError immediately
→ create no presentation/input resources
→ require no cleanup
```

`SchemaFormError.name` is exactly `"SchemaFormError"`.

`SchemaFormError.path` is deterministic:

```text
SCHEMA_FORM_INVALID_SCHEMA
  concrete declaration/member failure
  → exact schema path, e.g. schema.fields[2].key
  whole-schema shape/version/size failure
  → "schema"

SCHEMA_FORM_INVALID_INITIAL_VALUE
  concrete field/member failure
  → initialValue.<fieldKey>
  whole-object shape/size failure
  → "initialValue"

SCHEMA_FORM_ALREADY_OPEN
  → undefined

SCHEMA_FORM_VALIDATOR_FAILED
SCHEMA_FORM_INVALID_VALIDATOR_RESULT
  validateOnChange failure/result
  → "schema.validateOnChange"
  validateOnSubmit failure/result
  → "schema.validateOnSubmit"
```

`path` is diagnostic metadata only; callers must branch on `code`, not on message
text.

Preflight validation order is:

```text
validate schema
→ validate initialValue against the validated schema
→ check one-active-form-per-Frame precondition
→ create the form session/resources
```

`SCHEMA_FORM_ALREADY_OPEN` is therefore also rejected before the second call creates
any form resources and must not disturb the already-active form.

Validator/program failures for an already-open form use the normal settle-once cleanup
path and reject with `SchemaFormError`.

Frame abort remains separate and rejects with `AbortError`, not `SchemaFormError`.

## Validator data isolation

Validators receive a snapshot of current form values rather than direct mutable
access to Schema Form internal state.

The validator argument is exactly a detached `SchemaFormDataV1` snapshot. The
implementation MUST shallow-freeze that detached snapshot before invocation.

Validator mutation must never become an implicit state update mechanism.

## Security and trust boundary

`validateOnChange` and `validateOnSubmit` contain executable JavaScript.

Therefore SchemaFormV1 is not safe as arbitrary untrusted configuration merely
because its transport representation is JSON-compatible.

These fields are trusted executable schema content.

Schema Form must not evaluate validator source originating from untrusted users or
untrusted remote content.

This trust property must remain explicit in any API or content pipeline that accepts
SchemaFormV1.

## Example

```json
{
  "version": 1,
  "title": "Create Account",
  "description": "Enter account details.",
  "fields": [
    {
      "key": "username",
      "kind": "string",
      "label": "Username",
      "required": true,
      "maxLength": 32
    },
    {
      "key": "password",
      "kind": "string",
      "label": "Password",
      "required": true
    },
    {
      "key": "confirmPassword",
      "kind": "string",
      "label": "Confirm Password",
      "required": true
    },
    {
      "key": "level",
      "kind": "number",
      "label": "Level",
      "default": 1,
      "integer": true,
      "min": 1,
      "max": 100
    },
    {
      "key": "enabled",
      "kind": "boolean",
      "label": "Enabled",
      "default": true
    },
    {
      "key": "class",
      "kind": "select",
      "label": "Class",
      "required": true,
      "options": [
        {
          "value": "warrior",
          "label": "Warrior"
        },
        {
          "value": "mage",
          "label": "Mage"
        }
      ]
    }
  ],
  "validateOnChange": "(data) => data.password && data.password.length < 8 ? { password: 'Password must contain at least 8 characters' } : null",
  "validateOnSubmit": "(data) => data.password !== data.confirmPassword ? { confirmPassword: 'Passwords do not match' } : null"
}
```


## Presentation and RenderData

Schema Form projects authoritative module state into ordinary LoomRealm RenderNodes.
The Web presentation must consume presentation snapshots; it must not reinterpret the
original SchemaForm declaration as an independent source of form state.

The intended flow is:

```text
SchemaFormV1
    ↓ interpret
Schema Form authoritative state
    ↓ project
RenderData
    ↓
Web Components
```

The presentation layer is not validation authority and does not own defaults,
initial-value precedence, canonical form values, or submission validity.

### Render tree

The v1 presentation uses one root element and one stable child RenderNode per field.

Renderer node identity is private implementation identity. It MUST NOT be derived
from the schema field key. A legal `field.key` may already consume the full
128-byte RenderNode key limit, so prefixing or otherwise embedding it into a node key
would make valid Schema Form declarations unrenderable.

Each `openSchemaForm()` allocates one process-local monotonic safe-integer serial.
For serial `N` the implementation uses short internal keys:

```text
root       sf:N
field 0    sf:N:f:0
field 1    sf:N:f:1
...
```

The exact textual spelling above is frozen for v1 implementation consistency but is
not public Schema Form semantic identity. The serial is never reused while the
process is alive. If another serial cannot be represented as a JavaScript safe
integer, opening a new form fails as an internal module failure rather than wrapping
or reusing an old serial.

Conceptually:

```ts
const rootKey = `sf:${formSerial}`;

{
  key: rootKey,
  tag: "lr-schema-form",
  attrs: {
    class:
      "wa-theme-default wa-palette-default " +
      "wa-brand-blue wa-neutral-gray " +
      "wa-success-green wa-warning-yellow wa-danger-red",
  },
  data: formRenderData,
  children: fields.map((field, index) => ({
    key: `sf:${formSerial}:f:${index}`,
    tag: "lr-schema-form-field",
    attrs: {},
    data: {
      ...fieldRenderData,
      key: field.key,
    },
    children: [],
  })),
}
```

The schema `field.key` remains only semantic form identity and is carried in field
RenderData. Field order is represented by RenderNode child order. A field kind and
its internal RenderNode key are stable for the lifetime of one open form.

Schema Form creates its RenderDomain with:

```ts
const SCHEMA_FORM_Z_INDEX = 2_147_483_647;
```

v1 does not add a z-index allocator or overlay manager.

### Root RenderData

The root receives only state needed to present the form shell:

```ts
export interface SchemaFormRenderDataV1 {
  readonly title?: string;
  readonly description?: string;
  readonly cancelable: boolean;
}
```

The root is responsible for the form shell, title, description, field slot, and
submit/cancel controls.

A submit control represents a submit attempt. Browser-native validity and button
state are not authoritative form validity.


### Modal presentation

Schema Form is always presented as a modal dialog in v1.

`lr-schema-form` uses the bundled Web Awesome `wa-dialog` as the browser modality
primitive. Schema Form does not implement a second focus-trap, backdrop, or modal
stack.

The dialog is kept open for the lifetime of the current RenderNode. The component
uses `wa-dialog` with its built-in header disabled and renders the Schema Form shell
inside it:

```text
wa-dialog open + without-header
└── schema-form shell
    ├── header
    │   ├── title
    │   └── Close button   (cancelable=true only)
    ├── body
    │   └── projected field slot
    └── footer
        ├── Cancel button  (cancelable=true only)
        └── Submit button
```

The shell uses:

```text
dialog preferred width: 600px
dialog max-width: 80vw
shell width/max-width: 100%
shell max-height: 80vh
shell min-width/min-height: 0
grid rows: header / minmax(0, 1fr) / footer
wa-dialog internal body overflow: hidden
shell overflow: hidden
body overflow-x: hidden
body overflow-y: auto
body overscroll-behavior: contain
```

Long-form scroll ownership is frozen:

- the `wa-dialog` internal body never scrolls;
- the Schema Form shell never scrolls;
- the Schema Form body is the only vertical scroll container;
- header/footer remain outside the body and never move with field scrolling;
- horizontal form scrolling is prohibited;
- body scrolling does not propagate into document/page scrolling; and
- RenderData refresh preserves the current body scroll position through stable DOM.

Short forms remain compact because `80vh` is a maximum rather than a forced height.
Long forms are capped at `80vh`; only their body acquires a vertical scroll range.

The `wa-dialog` accessible label is the current Schema Form title. When no title is
declared, the browser component uses a stable fallback accessible label
`"Form"`. That fallback is presentation-only and does not alter RenderData.

Schema Form does not enable `light-dismiss`; backdrop clicks therefore never request
cancel.

Every `wa-hide` request is intercepted and `preventDefault()` is called so the
browser component never closes itself ahead of Schema Form authority.

```text
cancelable=true
+ wa-hide request (Escape or dialog close request)
→ preventDefault()
→ root emits semantic cancel
→ Subsystem settles
→ RenderDomain closes
→ DOM disappears

cancelable=false
+ wa-hide request
→ preventDefault()
→ emit nothing
→ dialog remains open
```

The explicit Schema Form Close and Cancel buttons do not directly close
`wa-dialog`; they call the same local `cancel()` action. Submit likewise never
directly closes the dialog.

`wa-dialog` owns the modal/top-layer mechanics, focus containment while open, and
backdrop/modal browser behavior. `lr-schema-form` owns previous-focus capture and
restoration after RenderDomain-driven removal. When connected, `lr-schema-form`
captures the previously focused meaningful `HTMLElement`. When the form is removed
after submit, cancel, or Frame abort, its `disconnectedCallback()` queues restoration
and calls `focus({ preventScroll: true })` only if the previous target remains
connected, visible, enabled, not inert, and focusable. A detached, disabled, hidden,
inert, or otherwise unfocusable target is skipped silently without throwing.

Because Schema Form prevents every `wa-hide`, the normal successful `wa-dialog`
close path is not a settlement path. The actual lifecycle is:

```text
semantic submit/cancel/abort
→ Subsystem settles
→ RenderDomain closes
→ Schema Form DOM is removed
→ lr-schema-form restores previous focus
```

### Modal interaction blocking

Browser modality is delegated to `wa-dialog`; Schema Form does not add
InputListener priority, capture, exclusivity, suspension, or another authority layer.

Pointer and keyboard events handled by the form presentation are stopped before they
bubble to the Window-level Renderer physical input source. The dialog's modal
behavior prevents ordinary underlying DOM interaction and keeps focus in the modal.

Wheel input over an overflowing Schema Form body scrolls that body without scrolling
the document/page. The body uses contained overscroll; no global scrolling manager or
additional modal authority is introduced.

This requirement is limited to browser pointer/keyboard interaction. Gamepad and
other non-DOM physical input suppression remain outside Schema Form v1.

### Field RenderData

Field RenderData is a presentation snapshot rather than the original field schema.

```ts
interface SchemaFormFieldRenderBaseV1 {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
  readonly required: boolean;
  readonly error?: string;
}

export type SchemaFormFieldRenderDataV1 =
  | (SchemaFormFieldRenderBaseV1 & {
      readonly kind: "string";
      readonly value: string;
      readonly placeholder?: string;
      readonly multiline: boolean;
      readonly minLength?: number;
      readonly maxLength?: number;
    })
  | (SchemaFormFieldRenderBaseV1 & {
      readonly kind: "number";
      readonly value?: number;
      readonly min?: number;
      readonly max?: number;
      readonly integer: boolean;
    })
  | (SchemaFormFieldRenderBaseV1 & {
      readonly kind: "boolean";
      readonly value: boolean;
    })
  | (SchemaFormFieldRenderBaseV1 & {
      readonly kind: "select";
      readonly value?: string;
      readonly options: readonly {
        readonly value: string;
        readonly label: string;
      }[];
    });
```

The value-presence rules are exact:

```text
string   → value is always present; empty is ""
boolean  → value is always present; unchecked is false
number   → value member is absent when canonical value is unset
select   → value member is absent when canonical value is unset
```

When an authoritative number/select changes from a concrete value to unset,
`RenderDomain.update()` removes the `value` member. It MUST NOT attempt to encode
`undefined` into RenderData. String/boolean values are always updated through a
concrete `set.value`.

Each field node is self-contained. A field receives its own current error string
rather than the complete form error map.

The Web Component must not receive or execute field defaults, invocation
`initialValue`, validator source, or any other authority that it would have to
reinterpret. Schema Form resolves those concerns before projection.

### Web Components

The v1 browser presentation uses two Custom Elements:

```text
lr-schema-form
lr-schema-form-field
```

`lr-schema-form` owns the visual form shell and submit/cancel controls.

`lr-schema-form-field` uses the frozen Web Awesome mapping:

```text
string + multiline=false → wa-input
string + multiline=true  → wa-textarea
number                    → wa-input, type=text, inputmode=decimal
boolean                   → wa-checkbox
select                    → wa-select + wa-option
```

These browser tags are implementation detail rather than public Schema Form schema
ABI, but the v1 browser artifact MUST use this mapping.

The components receive state through the existing Web presentation
`receiveRenderData(data)` convention. They MUST validate the complete incoming
RenderData shape before applying any part of it. Invalid RenderData synchronously
throws `TypeError` and leaves the last successfully applied browser state unchanged.


### Browser build and registration boundary

The platform-neutral TypeScript entry point remains:

```text
@loomrealm-game/schema-form
```

Browser TypeScript MUST reuse the formal Renderer presentation context type with a
type-only import:

```ts
import type {
  WebPresentationContext,
} from "@loomrealm/renderer/web-presentation";
```

This is a build-time type dependency only and MUST NOT create a browser/runtime
Renderer import in the emitted bundle.

It exports Schema Form declarations, errors, RenderData types, and
`openSchemaForm()`. It MUST NOT import DOM, Lit, Web Awesome, or browser-only code.

Browser presentation is not a second runtime module-loading API. It follows the
existing LoomRealm Web Presentation Config v1 model used by other game libraries.
The Schema Form package builds two self-contained presentation artifacts:

```text
dist/browser/schema-form.browser.js
dist/browser/schema-form.browser.css
```

The JS artifact is a classic-script-compatible self-executing bundle. Evaluation
registers exactly:

```text
lr-schema-form
lr-schema-form-field
```

before projection begins. If either LoomRealm-owned tag is already registered, script
evaluation throws `TypeError` rather than overwriting or silently accepting a
foreign definition.

There is no public `registerSchemaFormElements()`, no runtime `import()`, no bare
npm specifier resolution in the Renderer Window, and no Schema Form-specific browser
loader. Web Presentation Config loads the finished CSS/JS resources through its
ordinary ordered bootstrap:

```text
styles[]  → schema-form.browser.css
scripts[] → schema-form.browser.js
window.onload
→ presentation starts
```

Package exports expose the built files as browser resources:

```text
./browser/schema-form.browser.js
./browser/schema-form.browser.css
```

The browser bundle is side-effectful by design because its classic-script evaluation
registers Custom Elements. Package metadata MUST NOT incorrectly mark that browser
artifact as tree-shake-safe side-effect-free code; the root TypeScript module may
remain side-effect-free.

### Browser component implementation strategy

The authoring stack is frozen to:

```text
Schema Form browser source
        ↓
Lit 3.3.3
        ↓
Web Awesome 3.14.0
        ↓
esbuild 0.25.9 at build time
        ↓
self-contained classic JS + CSS
        ↓
Web Presentation Config v1
```

Lit and Web Awesome are build-time browser dependencies, not runtime module-loading
requirements of Renderer Window. esbuild bundles all selected component JavaScript
into `schema-form.browser.js`.

The browser CSS entry imports only the required Web Awesome theme and palette:

```css
@import "@awesome.me/webawesome/dist/styles/themes/default.css";
@import "@awesome.me/webawesome/dist/styles/color/palettes/default.css";
```

It MUST NOT import the aggregate `webawesome.css` bundle. Schema Form adds only its
own modal/layout/override CSS. esbuild emits the resulting
`schema-form.browser.css`.

The root RenderNode carries the fixed Web Awesome theme/palette/variant classes, so
the variables cascade through `lr-schema-form`, its projected field children, and
their shadow trees without mutating `document.documentElement` or requiring the game
host to know Web Awesome.

The browser source imports only required Web Awesome component implementations:

```text
@awesome.me/webawesome/dist/components/input/input.js
@awesome.me/webawesome/dist/components/textarea/textarea.js
@awesome.me/webawesome/dist/components/checkbox/checkbox.js
@awesome.me/webawesome/dist/components/select/select.js
@awesome.me/webawesome/dist/components/option/option.js
@awesome.me/webawesome/dist/components/button/button.js
@awesome.me/webawesome/dist/components/dialog/dialog.js
```

The final classic bundle MUST contain no dynamic `import()`, no external bare npm
specifier, no ESM module graph, and no dependency on `node_modules` at presentation
runtime.

The bundled Web Awesome component registrations are Window-global. Schema Form v1
therefore claims exclusive ownership of the Web Awesome tags bundled into this
presentation artifact for the Renderer Window lifetime. It does not attempt to reuse,
version-negotiate, or coexist with a separately loaded Web Awesome bundle. Any
registration collision during classic-script evaluation is an ordinary Web
Presentation bootstrap failure, so presentation does not start in that Window.

The v1 control mapping is frozen:

```text
string + multiline=false   → wa-input
string + multiline=true    → wa-textarea
number                     → wa-input with text editing + inputmode="decimal"
boolean                    → wa-checkbox
select                     → wa-select + wa-option
form action                → wa-button
```

`wa-number-input` is intentionally not used in v1. Canonical Schema Form number
authority must not be coupled to a third-party numeric model that may normalize an
in-progress lexical draft.

Third-party component names never appear in `SchemaFormV1`,
`SchemaFormFieldRenderDataV1`, canonical state, or the root public module API.

#### Root form behavior

`lr-schema-form` renders a semantic browser `<form novalidate>` shell, field slot,
and submit/cancel controls. Browser/native validity is not submission authority.
Submit is only a semantic submit attempt sent back to the Schema Form module.

#### Field wrapper behavior

`lr-schema-form-field` translates one
`SchemaFormFieldRenderDataV1` snapshot into the corresponding Web Awesome control
and reports local edits to its owning `lr-schema-form`.

The wrapper owns presentation-only conversion and lexical draft state. It does not
decide Schema Form validity.

#### Error presentation

Field errors come only from `SchemaFormFieldRenderDataV1.error`. Web Awesome/native
constraint validation MUST NOT create a second validity authority.

The browser adapter does not forward Schema Form `required`, `minLength`,
`maxLength`, `min`, `max`, or `integer` into native/Web Awesome constraints
that can block, normalize, or independently invalidate input. `required` is rendered
only as a Schema Form visual required marker. `placeholder`, labels, descriptions,
and module-produced `error` remain ordinary presentation.

A select is always rendered `with-clear` so unset remains user-reachable. Web
Awesome's empty control value is reserved internally for unset. Each semantic option
is mapped to a stable private DOM token by schema order:

```text
option index 0 → "o:0"
option index 1 → "o:1"
...
```

RenderData semantic `option.value` strings are never placed directly into
`wa-option.value`. On RenderData, semantic value → token; on user read,
token → semantic value. Thus semantic `option.value === ""` remains distinct from
browser unset.

### Number editing strategy

A number field deliberately uses a text-capable `wa-input`. The field wrapper keeps:

```ts
private draft: string;
private dirty: boolean;
```

The presentation snapshot conversion is exact:

```text
""                → null
"-"               → null
"+"               → null
"1." / "-1."      → null
complete JSON-style decimal/exponent lexical form
                  → Number(draft), only when finite
all other drafts  → null
```

No trim, locale decimal conversion, grouping separator conversion, or Unicode-number
normalization is performed.

A complete numeric draft follows JSON number lexical structure:

```text
-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?
```

The DOM input may accept a wider temporary lexical draft; only `readFormValue()`
performs the conversion above.

Reconciliation is intentionally asymmetric because opened Schema Form v1 has no
external field-value mutation API. Canonical value changes during the interaction
come from the same browser presentation snapshots.

```text
first successful RenderData
→ draft = incoming value === undefined ? "" : String(incoming value)
→ dirty = false

local number input
→ draft = exact editor text
→ dirty = true

later successful RenderData while dirty=false
→ synchronize draft from incoming value

later successful RenderData while dirty=true
→ NEVER overwrite draft
→ update only errors/label/constraints/other presentation facts
```

Once the user has edited a number field, `dirty` remains true for that field
element's lifetime. It is reset only by a fresh element/form lifetime.

This preserves incomplete or formatting-significant drafts such as `"-"`, `"1."`,
`"1.0"`, and `"1e"` across Change/validation RenderData round trips while the
Subsystem remains authority for canonical number-or-absence state.

### Stable editing DOM

A Web Component must not rebuild its editing control on every
`receiveRenderData()` call.

Repeated replacement of an active input can destroy focus, selection, and IME
composition state. Components MUST create stable editing DOM and patch changed
properties/text instead.

Changing a field's `kind` while the form is open is not supported.

### Presentation-local drafts

The browser presentation may retain transient editing state that is not itself a
valid canonical JSON value.

This is especially important for number editing. Text such as:

```text
-
1.
```

can be a meaningful in-progress browser edit even though it is not a valid JSON
number.

Therefore:

```text
presentation-local lexical draft
              ≠
canonical Schema Form value
```

Transient DOM editing mechanics, including cursor position, selection, composition,
and incomplete numeric text, belong to Presentation.

Schema Form remains authority for canonical field values.

Before the first local number edit, RenderData remains the source of the editor text.
After the first local number edit, later RenderData MUST NOT replace that field's
lexical draft for the lifetime of the current element.

### Presentation actions

Schema Form uses one outward communication boundary for the whole component tree:

```text
lr-schema-form-field
        │
        │ local method / callback
        ▼
lr-schema-form
        │
        │ the only emitCustomEvent() user
        ▼
Renderer
        ▼
Subsystem
```

Field components do not emit Renderer custom events directly.

The root `lr-schema-form` owns:

```text
fieldChanged(...)
submit()
cancel()
collectValues()
```

Submit/Cancel buttons are presentation-internal controls. They call the owning form
component directly. Field editors likewise notify the owning form directly when their
presentation-local value changes.

The only Schema Form custom-event names emitted through the Renderer capability are:

```text
change
submit
cancel
```

All three events originate from the unique root RenderNode allocated for that
`openSchemaForm()` instance:

```text
targetKey = rootKey
```

The Schema Form module records `rootKey` when opening the form and uses it as the
instance correlation token for incoming presentation events.

There are no field-level outward `change` or `clear` events in v1.

### Presentation edit snapshot

Change and Submit both carry a complete current presentation value snapshot.

The field component converts its browser-local editor state into a JSON-compatible
typed value before the root form collects the snapshot.

The outward presentation value type is:

```ts
export type SchemaFormPresentationValueV1 =
  | string
  | number
  | boolean
  | null;

export type SchemaFormPresentationValuesV1 =
  Readonly<Record<string, SchemaFormPresentationValueV1>>;
```

Field mapping is intentionally asymmetric:

```text
string   → string
number   → finite number | null
boolean  → boolean
select   → string | null
```

For string fields, empty input is represented as `""`; there is no separate
string-null state.

For checkbox/boolean fields, unchecked is `false`; there is no separate boolean-null
state.

For number and select fields, `null` means unset from the subsystem's point of view
and is omitted from canonical `SchemaFormDataV1`.

For number fields, the field component may retain arbitrary presentation-local
lexical drafts while editing. If the current draft cannot be converted to a finite
number when the value snapshot is collected, the field contributes `null`.

For example:

```text
string ""          → outward value ""
checkbox unchecked → outward value false
number "12.5"      → outward value 12.5
number "1."        → outward value null
number "-"         → outward value null
unset select       → outward value null
```

The lexical number draft remains local to `lr-schema-form-field`; the subsystem
never receives an invalid-number draft string.

The root form collects exactly one entry for every current schema field key.

Conceptually:

```ts
interface SchemaFormFieldElement {
  readFormValue(): {
    readonly key: string;
    readonly value: SchemaFormPresentationValueV1;
  };
}
```

and:

```ts
class SchemaFormElement extends HTMLElement {
  fieldChanged(field: SchemaFormFieldElement): void;
  submit(): void;
  cancel(): void;
  collectValues(): SchemaFormPresentationValuesV1;
}
```

For every Change and Submit event:

```text
Object.keys(values)
==
the exact SchemaFormV1.fields[*].key set
```

No schema field may be omitted from the presentation snapshot. Number/select fields
that are unset use `null`; string/boolean fields always use their concrete value.

Unknown extra keys and missing keys are malformed presentation snapshots.

The form MUST accept a field notification only when
`field.parentElement === this` at notification time. Any other/stale field
notification is ignored.

### Change event

When any field changes, the root form collects the complete latest edit snapshot and
emits:

```ts
context.emitCustomEvent("change", {
  values: this.collectValues(),
});
```

Example:

```json
{
  "values": {
    "name": "Alice",
    "age": null,
    "enabled": false,
    "class": "mage"
  }
}
```

A Change event represents the current presentation snapshot, not an incremental
command log.

This is intentionally compatible with existing User Input `.event` semantics:
intermediate events may be dropped under bounded backpressure, while any later Change
event contains the complete current edit snapshot and can converge the subsystem to
the latest presentation state.

Presentation does not debounce or coalesce Change in v1.

The field-to-root trigger is frozen:

```text
single-line string / wa-input  → input
multiline string / wa-textarea → input
number / wa-input              → input
boolean / wa-checkbox          → change
select / wa-select             → change
```

Each accepted user-originated control event performs exactly one:

```text
fieldChanged()
→ collectValues()
→ event-size preflight
→ emit one complete Change snapshot when within the size bound
```

Programmatic control updates caused by `receiveRenderData()` MUST NOT call
`fieldChanged()` or emit Change.

### Submit event

Submit must independently collect the complete current snapshot at the moment of the
submit attempt:

```ts
context.emitCustomEvent("submit", {
  values: this.collectValues(),
});
```

Submission correctness must not depend on all prior Change events having been
delivered.

The subsystem treats the Submit snapshot itself as the complete candidate input for
that submit attempt.

It then:

```text
validate exact presentation snapshot shape
        ↓
interpret typed values using SchemaFormV1
        ↓
number/select null → omit field from canonical candidate
string/boolean and non-null number/select → canonical candidate value
        ↓
run built-in validation
        ↓
run validateOnSubmit
        ↓
errors → update RenderData and keep form open
valid  → resolve submitted result and close RenderDomain
```

The Web Component must not remove or hide itself on Submit. A successful submit is
closed only by authoritative subsystem RenderDomain removal.

### Cancel event

The root form emits:

```ts
context.emitCustomEvent("cancel");
```

for the header close button, footer Cancel button, and Escape when
`cancelable=true`.

The presentation must not remove itself on Cancel.

The subsystem re-checks `request.cancelable`. If cancellation is allowed, it
resolves the cancelled result and closes the RenderDomain.

### Canonical state versus presentation snapshot

The authority split is:

```text
field component
  owns DOM editor state / lexical draft
  maps string to string and checkbox to boolean
  maps number/select unset or unconvertible number state to null

lr-schema-form
  owns aggregation of the complete typed presentation snapshot

Schema Form module
  owns canonical data construction, validation, errors, submit/cancel completion
```

In short:

> Form Component owns the current presentation edit snapshot; Schema Form module owns
> the canonical form state.

A Change snapshot maps `null` to absence only for number/select fields. String and
boolean fields always contribute their concrete value, including `""` and `false`. A Submit attempt must always interpret its own
complete snapshot rather than assuming that all previous Change events were delivered.

### RenderData reconciliation after validation

A field component may retain a browser-local lexical draft that does not match its
last authoritative RenderData value.

For example:

```text
authoritative number value = 1
local numeric draft         = "1."
outward presentation value  = null
```

The local draft `"1."` is not sent to the subsystem. The root form contributes
`null` for that field.

If validation returns RenderData after such an edit, the field component preserves
the exact draft regardless of whether the canonical authoritative value is unchanged,
changed to another number, or becomes absent. While dirty, it applies only new
errors, labels, constraints, and other presentation facts.

This keeps number editing, selection, focus, and IME behavior stable while the
Subsystem continues to own canonical values and validation. There is no v1
programmatic external field-value update that needs to override a dirty editor.

### Existing Web Presentation dependency

The architecture required by Schema Form Phase 2 is already implemented and
normative. Schema Form consumes it; it does not redefine or extend it.

The existing path is:

```text
WebPresentationContext.emitCustomEvent(name, data)
    ↓
Renderer-bound RenderNode provenance/currentness
    ↓
x.loomrealm.web-presentation.event
    ↓
existing User Input v1 targeted delivery
```

Normative platform contracts are:

```text
doc/15-contracts/web-presentation-api-v1.md
doc/15-contracts/user-input-v1.md
```

Schema Form correlates an incoming event only by the unique root `targetKey`
allocated for its active form. `domainId` remains generic Renderer provenance and is
not Schema Form semantic identity.

The root `lr-schema-form` is the only node that emits Renderer custom events.
Field components communicate with the root locally. The only outward names are:

```text
change
submit
cancel
```

Change and Submit use:

```ts
context.emitCustomEvent(name, {
  values: this.collectValues(),
});
```

The presentation enforces the Schema Form-specific custom-event data bound before
calling `emitCustomEvent()`:

```text
compact JSON byte length of the component-supplied data object <= 131,072 bytes
```

For Change, an oversize snapshot is retained locally and no event is emitted. For
Submit, no event is emitted and the root shows a presentation-local
"Form data is too large" message. This message is not a field validation error and is
cleared once the current collected snapshot is within the bound.

The generic Renderer/User Input limit remains independently authoritative after this
stricter presentation-local check.

### Subsystem consumption

Schema Form listens on the reserved presentation channel using the same Frame that
opened the form:

```ts
const listener = scope.createInputListener({
  frame,
  channels: ["x.loomrealm.web-presentation.event"],
});

listener.on(
  "x.loomrealm.web-presentation.event",
  (event) => {
    // accept only the unique root target allocated for this open form
    // then handle change / submit / cancel
  },
);
```

The module records the unique `rootKey` created for the form instance and correlates
incoming events with:

```text
targetKey = rootKey
```

Schema Form does not need access to the Renderer wire `domainId` to identify its
own form instance. `domainId` may remain present in the generic presentation-event
payload as Renderer provenance, but it is not part of the Schema Form module's
correlation contract.

The subsystem-side event boundary is fail-closed:

```text
targetKey != active rootKey       → ignore
unknown event name                → ignore
malformed change/submit payload   → ignore with no state mutation
cancel while cancelable=false     → ignore
duplicate event after settlement  → ignore
```

For current-root Change/Submit events, the subsystem independently re-measures the
complete component-supplied event data object using compact JSON UTF-8 encoding.
If it exceeds 131,072 bytes, the event is malformed and is ignored with zero state
or error mutation. The browser-side size check is early UX containment; this
subsystem-side recheck is the authoritative Schema Form boundary.

Malformed presentation input does not add another public `SchemaFormErrorCode`.
Validator/program failures remain the only opened-form program failures described by
the public error contract.

For Change and Submit, `data.values` must have exactly the schema field-key set.
Missing keys, unknown extra keys, wrong value types, non-finite numbers, null
string/boolean values, invalid select values, stale root targets, and unknown event
names are malformed or inapplicable input and must not be trusted merely because
they came from Presentation.

For `change`:

```text
complete typed presentation snapshot
    ↓
number/select null → omit from canonical candidate
string/boolean and non-null number/select → validate against schema kind
    ↓
built-in field validation
    ↓
validateOnChange(canonicalData)
    ↓
RenderDomain.update(field errors/current authoritative data)
```

A browser-local number draft that cannot be converted is already represented as
`null` by the field component, so the subsystem does not parse lexical numeric
drafts.

For `submit`:

```text
complete submit snapshot
    ↓
construct canonical candidate independently of previous Change delivery
    ↓
complete built-in validation
    ↓
validateOnSubmit(canonicalData)
    ↓
errors → keep RenderDomain open and update field errors
valid  → resolve submitted result and close RenderDomain
```

For `cancel`:

```text
re-check request.cancelable
    ↓
allowed → resolve cancelled and close RenderDomain
denied  → ignore
```

This preserves the rule that field components own browser-local conversion, while the
Schema Form module owns canonical data, validation, completion, and RenderDomain
lifetime.

### Phase 2 implementation boundary

Phase 2 changes Schema Form package code and its tests/qualification only. It does
not add another Renderer/Main/Subsystem architecture feature.

The implementation may depend on the existing public capabilities:

```text
SubsystemScope.createRenderDomain(...)
SubsystemScope.createInputListener(...)
Frame.signal
WEB_PRESENTATION_EVENT_CHANNEL_V1
WebPresentationContext.emitCustomEvent(...)
```

No new Renderer wire message, RenderDomain operation, InputListener priority,
InputTarget authority, subsystem definition, or `frame.call()` path is permitted.

### Separation from modal event blocking

The custom-event capability and modal event blocking are independent presentation
concerns:

```text
emitCustomEvent(...)
→ reports semantic form actions to the owning subsystem

backdrop + focus containment + stopPropagation()
→ prevents underlying browser pointer/keyboard interaction
```

The latter remains entirely within Web Presentation and requires no change to
LoomRealm input authority or protocol semantics.

### RenderData example

Given canonical data:

```json
{
  "name": "Alice",
  "age": 15
}
```

and a current validation error for `age`, the projection may be:

```ts
{
  zIndex: 2_147_483_647,
  roots: [{
    key: "sf:12",
    tag: "lr-schema-form",
    attrs: {
      class:
        "wa-theme-default wa-palette-default " +
        "wa-brand-blue wa-neutral-gray " +
        "wa-success-green wa-warning-yellow wa-danger-red",
    },
    data: {
      title: "Character",
      cancelable: true,
    },
    children: [
      {
        key: "sf:12:f:0",
        tag: "lr-schema-form-field",
        attrs: {},
        data: {
          key: "name",
          kind: "string",
          label: "Name",
          required: false,
          value: "Alice",
          multiline: false,
        },
        children: [],
      },
      {
        key: "sf:12:f:1",
        tag: "lr-schema-form-field",
        attrs: {},
        data: {
          key: "age",
          kind: "number",
          label: "Age",
          required: false,
          value: 15,
          integer: true,
          error: "Must be at least 18",
        },
        children: [],
      },
    ],
  }],
}
```

The projection is a complete current presentation snapshot. Presentation errors or
Renderer teardown must not be interpreted as submit or cancel.


## Phase 2 implementation contract

The executable implementation plan is frozen separately in:

```text
game-libs/schema-form/IMPLEMENTATION-PHASE-2-SCHEMA-FORM.md
```

That document controls implementation order, private file boundaries, tests, package
changes, and acceptance criteria. This DESIGN document controls public/observable v1
semantics.

## Explicit v1 exclusions

This declaration model does not define:

- JSON Schema compatibility.
- `uiSchema`.
- Conditional visibility.
- Dynamic fields.
- Cross-field dependency declarations.
- Asynchronous validation.
- Remote options.
- Nested arbitrary objects.
- Recursive arrays.
- Widget registries.
- Theme or layout DSLs.
- Providers or plugins.
- Computed fields.
- General-purpose scripting beyond the two trusted synchronous validators.
- Arbitrary extension or metadata bags.

These features require separate design work rather than being implied by the v1
schema.
