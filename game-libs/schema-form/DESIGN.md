# Schema Form Design

Status: draft

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

Opening a second form while another Schema Form is still active for that Frame fails
immediately with:

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

For select fields, non-empty submitted values must exactly match one declared
`options[*].value`.

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
maximum fields                 128
maximum field.key UTF-8 bytes  128
maximum custom-event payload   128 KiB
```

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
declared field kind and built-in constraints.

Select rules are:

```text
option.value values are unique
default, when present, matches one option.value
initialValue, when present, matches one option.value
```

`initialValue` must not contain unknown field keys.

A Change or Submit presentation payload must remain below 128 KiB after compact JSON
encoding. Presentation must contain an oversize snapshot locally rather than passing
it into the Renderer/Data writer. The lower limit intentionally leaves room below
the generic User Input transport hard limit.

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
type SchemaFormValidationDataV1 =
  Readonly<Record<string, unknown>>;
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

Internally these may all be normalized to an empty error map.

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

Therefore:

```text
invalid schema / initialValue
→ reject SchemaFormError immediately
→ create no presentation/input resources
→ require no cleanup
```

When useful, `SchemaFormError.path` should identify the failing declaration location,
for example:

```text
schema.fields[2].key
schema.fields[4].min
initialValue.level
```

`path` is diagnostic metadata only; callers must branch on `code`, not on message
text or path formatting.

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

The public contract treats the argument as read-only. Implementations should use a
defensive snapshot and may freeze that snapshot as an implementation detail.

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

Each `openSchemaForm()` call allocates a unique root RenderNode key for that form
instance. The key is stable for the lifetime of the open form and is used to correlate
presentation events back to that instance without exposing the RenderDomain wire id.

For example:

```text
lr-schema-form                schema-form:12
├── lr-schema-form-field      field:name
├── lr-schema-form-field      field:age
├── lr-schema-form-field      field:enabled
└── lr-schema-form-field      field:class
```

Conceptually:

```ts
const rootKey = allocateSchemaFormRootKey();

{
  key: rootKey,
  tag: "lr-schema-form",
  attrs: {},
  data: formRenderData,
  children: fields.map((field) => ({
    key: `field:${field.key}`,
    tag: "lr-schema-form-field",
    attrs: {},
    data: fieldRenderData,
    children: [],
  })),
}
```

A root key may be implemented with a process-local monotonic serial such as
`schema-form:12`. The exact textual serial is private implementation detail; uniqueness
among concurrently/live created form RenderNodes is the requirement.

The field declaration key is semantic form identity. The field RenderNode key derives
deterministically from it. Field order is represented by RenderNode child order.

A field kind is stable for the lifetime of an open form. The presentation must not
change the tag of a live RenderNode.

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

The modal must visually and interactively cover the underlying presentation while it
is open.

Its fixed structural regions are:

```text
backdrop
└── dialog
    ├── header
    │   ├── title
    │   └── close icon button   (cancelable=true only)
    │
    ├── body
    │   └── form field slot
    │
    └── footer
        ├── Cancel button       (cancelable=true only)
        └── Submit button
```

The header displays the form title. The body contains the projected field nodes. The
footer contains form actions.

The preferred browser layout constraints are:

```css
.dialog {
  width: 600px;
  max-width: 80vw;
  max-height: 80vh;

  display: grid;
  grid-template-rows:
    auto
    minmax(0, 1fr)
    auto;
}

.body {
  overflow: auto;
}
```

The header and footer remain fixed within the dialog while only the body scrolls when
the field content exceeds the available height.

The backdrop covers the full viewport:

```css
.backdrop {
  position: fixed;
  inset: 0;

  display: grid;
  place-items: center;

  pointer-events: auto;
}
```

The root dialog must expose modal accessibility semantics, conceptually:

```html
<section role="dialog" aria-modal="true">
```

The browser implementation must trap focus within the dialog while open and restore
the previous focus target when the modal closes.

When `cancelable=true`, the header close icon button, footer Cancel button, and
Escape key all produce the same semantic action:

```ts
{ type: "cancel" }
```

Backdrop clicks do not cancel the form in v1.

When `cancelable=false` or is omitted, no user-visible cancel affordance is rendered
and Escape does not request cancellation.

The root RenderData carries the resolved boolean:

```ts
readonly cancelable: boolean;
```

The Web Component must not inspect the original request object to determine
cancelability.

### Modal interaction blocking

Schema Form modality is a browser-presentation concern in v1. It does not introduce
or require a new LoomRealm input-authority mechanism.

While the modal is open, the presentation must prevent underlying browser mouse and
keyboard interaction from reaching lower presentation layers.

The full-screen backdrop blocks pointer interaction with elements underneath it.

The modal must also keep keyboard focus inside the dialog. Keyboard and pointer
events originating inside the modal presentation must be stopped before they bubble
to the Window-level Renderer physical input source.

Conceptually:

```text
pointer
  ↓
full-screen modal backdrop/dialog
  ↓
handled locally + stopPropagation()
  ×
underlying DOM / Window gameplay input listener

keyboard
  ↓
focus remains inside modal
  ↓
handled locally + stopPropagation()
  ×
Window gameplay input listener
```

This requirement is intentionally limited to browser mouse/pointer and keyboard
interaction. Schema Form v1 does not add InputListener priority, capture, exclusivity,
or suspension semantics and does not modify Main/InputTarget/InputGate authority.

Gamepad or other non-DOM physical input suppression is outside this modal
presentation requirement.

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
      readonly value?: string;
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
      readonly value?: boolean;
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

Each field node is self-contained. For example, a field receives its own current
error string rather than the complete form error map.

The Web Component must not receive or execute:

- field defaults;
- invocation `initialValue`;
- `validateOnChange`;
- `validateOnSubmit`;
- validator source;
- validation authority state that it is expected to reinterpret.

Schema Form resolves those concerns before projection.

For example, if a number field has `default: 1`, the presentation receives
`value: 1`; it does not receive an absent value plus a default and decide which one
to display.

### Web Components

The v1 browser presentation uses two Custom Elements:

```text
lr-schema-form
lr-schema-form-field
```

`lr-schema-form` owns the visual form shell and submit/cancel controls.

`lr-schema-form-field` selects the appropriate native editing control from
`data.kind`:

```text
string + multiline=false → single-line text editor
string + multiline=true  → multiline text editor
number                    → numeric editor
boolean                   → boolean control
select                    → option selector
```

These mappings are browser-presentation implementation choices. They are not part of
the public SchemaForm schema ABI.

The components receive state through the existing Web presentation
`receiveRenderData(data)` convention. They should validate the incoming RenderData
shape before applying it.


### Browser component implementation strategy

The browser presentation should avoid reimplementing low-level form-control behavior
such as keyboard interaction, focus management, accessibility semantics, select
popups, checkbox behavior, and basic control styling.

The preferred v1 implementation stack is:

```text
LoomRealm Renderer contract
        │
        │ receiveRenderData(data)
        ▼
lr-schema-form / lr-schema-form-field
        │
        │ implemented with
        ▼
Lit
        │
        │ composes
        ▼
Web Awesome controls
```

Lit is used only as an implementation aid for the two LoomRealm-owned Custom
Elements. It provides stable reactive rendering and localized DOM updates while the
public Renderer contract remains the ordinary Custom Element
`receiveRenderData(data)` convention.

Web Awesome provides the underlying browser form controls.

The intended mapping is:

```text
Schema Form field                  Browser control
────────────────────────────────   ─────────────────────
string + multiline=false           wa-input
string + multiline=true            wa-textarea
number                              wa-number-input
boolean                             wa-checkbox
select                              wa-select + wa-option

form action                         wa-button
```

The LoomRealm-owned wrapper components remain:

```text
lr-schema-form
lr-schema-form-field
```

Third-party component names must not appear in `SchemaFormV1`,
`SchemaFormFieldRenderDataV1`, public module APIs, or authoritative form state.
They are browser-presentation implementation details only.

In particular, v1 must not introduce schema properties such as:

```ts
widget: "wa-input"
component: "wa-select"
```

The dependency direction must remain:

```text
Schema contract
    ↓
Schema Form authority
    ↓
RenderData contract
    ↓
LoomRealm Web Component wrapper
    ↓
Lit / Web Awesome
```

and never the reverse.

#### Root form behavior

`lr-schema-form` should render a semantic browser `<form>` shell, field slot, and
submit/cancel controls.

The browser form should not become validation authority. The preferred browser
presentation uses `novalidate` and treats Submit as a semantic submit attempt.

Built-in browser or third-party constraint-validation behavior may assist
presentation, but the Schema Form module remains the authority that decides whether
submission completes.

#### Field wrapper behavior

`lr-schema-form-field` should translate
`SchemaFormFieldRenderDataV1` into the corresponding third-party form control and
report local edit changes to its owning `lr-schema-form`.

Field components do not communicate with the Renderer or subsystem directly.
`lr-schema-form` is the single outward communication boundary for the complete
form component tree.

It remains responsible for Schema Form-specific presentation concerns such as:

- mapping `label`, `description`, `required`, and `error`;
- maintaining presentation-local edit state when required;
- preserving focus, selection, and IME composition;
- exposing the current error with appropriate accessible semantics;
- exposing its current presentation edit value to the owning form;
- notifying the owning form when that local edit value changes;
- insulating the Schema Form contract from third-party component APIs.

The field wrapper should not own defaults, validation rules, canonical value
authority, or submission decisions.

#### Error presentation

The RenderData contract remains:

```ts
readonly error?: string;
```

The wrapper may map this onto whatever error, hint, invalid-state, ARIA, or supporting
text facilities the selected component library provides.

If the third-party component does not provide an appropriate error presentation, the
wrapper may render LoomRealm-owned error markup around it.

The Schema Form authority must not depend on a third-party validation API or
third-party error object shape.

#### Number-control qualification

The numeric control requires explicit qualification before its implementation choice
is frozen.

A browser numeric editor must preserve usable transient lexical states such as:

```text
-
1.
```

without prematurely forcing them into canonical JSON numbers or destroying the
user's local draft.

The preferred first candidate is `wa-number-input`.

Before freezing that choice, an implementation spike must verify its behavior for:

- incomplete numeric input;
- negative sign entry;
- decimal separator entry;
- focus and selection preservation across RenderData refreshes;
- `beforeinput`, `input`, and `change` behavior;
- external authoritative value replacement.

If its normalization behavior conflicts with Schema Form's canonical-value versus
presentation-draft model, the wrapper should instead use a text-capable control
(for example `wa-input` with an appropriate input mode) and own numeric lexical
draft handling itself.

#### Alternative component libraries

Other standards-based Web Component libraries may be evaluated, but they must remain
behind the same LoomRealm-owned wrapper boundary.

Spectrum Web Components is a possible alternative when adopting the Adobe Spectrum
design language is desirable.

Lion is a possible white-label foundation, but its own model-value, validation,
formatting, parsing, and form-registration abstractions overlap substantially with
Schema Form authority. For v1, that overlap makes it a less direct fit than a thinner
presentation library.

The preferred v1 direction is therefore:

```text
Lit + Web Awesome
```

subject to the number-control qualification above.


### Stable editing DOM

A Web Component must not rebuild its editing control on every
`receiveRenderData()` call.

Repeated replacement of an active input can destroy focus, selection, and IME
composition state. Components should create stable DOM and patch changed properties
and text instead.

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

An incoming RenderData refresh must not unnecessarily destroy an equivalent active
local draft. An actual authoritative value change may replace the local draft.

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

The form should accept a field notification only while that field is still a direct
current child of the form, for example by checking `field.parentElement === this`.

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

Presentation may coalesce multiple rapid field changes into one later Change event,
provided that the emitted event contains the complete latest snapshot.

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

If validation causes the subsystem to return RenderData whose authoritative value has
not changed, the field component must not unnecessarily destroy the active local
draft merely because the authoritative value remains `1` or becomes absent.

A field should therefore distinguish at least:

```text
last authoritative value
current presentation-local editor state
```

On `receiveRenderData()`:

```text
authoritative value unchanged
→ preserve compatible active local draft
→ update error/label/constraints

authoritative value actually changed
→ authoritative replacement may reset local draft
```

This keeps number editing, selection, focus, and IME behavior stable while the
subsystem continues to own canonical values and validation.

### Required LoomRealm Web Presentation extension

The existing Web Presentation API already injects a Renderer-owned context into each
business Custom Element through:

```ts
receiveRenderContext(context)
```

Schema Form does not require a second public capability object or a separate
presentation-event API surface.

Instead, the existing `WebPresentationContext` is extended directly:

```ts
interface WebPresentationContext {
  readonly resources: PresentationResourceClient;

  emitCustomEvent(
    name: string,
    data?: JsonObject,
  ): void;
}
```

The intended public surface is exactly the context above. v1 does not introduce an
additional shape such as:

```ts
context.events.emit(...)
```

or a separate public `PresentationEventClient`.

This is an intentional reopen of the current Web Presentation v1 context, whose
frozen shape currently contains only `resources`.

The reason for reopening is a demonstrated interactive business-component
requirement: a business Custom Element must be able to report semantic user actions
back through the Renderer while preserving existing LoomRealm authority boundaries.

This extension must not create a reverse Render protocol and must not make DOM state
authoritative.

### Shared resources, per-RenderNode context

The current WebProjector implementation creates one shared
`WebPresentationContext` instance and injects that same object into every projected
Custom Element.

That implementation is sufficient while the context contains only a Window-scoped
resource capability:

```text
all projected elements
        ↓
same WebPresentationContext
        ↓
same PresentationResourceClient
```

It is not sufficient once `emitCustomEvent()` is added.

A call such as:

```ts
context.emitCustomEvent("submit", data);
```

must be attributed to the exact live RenderNode that received that context. The
business component must not be required or allowed to provide Renderer authority
identity itself.

Therefore the WebProjector implementation changes from:

```text
one shared WebPresentationContext
```

to:

```text
one shared PresentationResourceClient
+ one WebPresentationContext per live RenderNode
```

The resource capability remains shared because its authority/lifetime is
Renderer-Window scoped.

The event closure is per RenderNode because its authority/lifetime is bound to that
specific live projected identity.

Conceptually:

```ts
const sharedResources =
  createPresentationResourceClient(...);

const context = Object.freeze({
  resources: sharedResources,

  emitCustomEvent(name, data = {}) {
    emitPresentationEvent({
      sessionId: record.sessionId,
      subsystemKey: record.subsystemKey,
      generation: record.generation,
      domainId: record.domainId,
      targetKey: record.targetKey,
      name,
      data,
    });
  },
});
```

The public component API therefore stays simple:

```ts
context.emitCustomEvent("submit", {
  values: this.collectValues(),
});
```

while the closure already knows which RenderNode emitted the event.

### Identity-bound capability

A live projected node already has the Renderer-known identity:

```text
(Session, subsystemKey, generation, domainId, targetKey)
```

The Web Component must not be allowed to provide or override:

```text
sessionId
subsystemKey
generation
domainId
targetKey
frameId
activationId
input channel
```

Those values are Renderer/Main authority facts.

The semantic rule is:

```text
receiveRenderData(...)
→ data belongs to this RenderNode

emitCustomEvent(...)
→ event also belongs to this RenderNode
```

That symmetry is the reason for binding `emitCustomEvent()` through a
per-RenderNode context closure rather than through a shared anonymous event function.

Schema Form itself uses the capability only on the root `lr-schema-form`; field
components communicate with that root locally. The Renderer-level capability remains
generic so other business Web Components may use the same context contract in the
future.

### Stale capability behavior

A business component may retain a reference to an old presentation context.

Therefore `emitCustomEvent()` must fail closed after its source RenderNode is no
longer live.

Before forwarding an event, the WebProjector must verify that:

```text
Projector is not torn down
AND Projector has not structurally failed
AND the bound LiveElement record is still the current record for that identity
```

If any check fails, the event is dropped.

The ControlHolder must independently re-check current authority before accepting the
event. At minimum:

```text
current Session matches
AND current subsystem Data slot exists
AND current generation matches
AND current carrier/store is presentation-current
AND domainId is live and baselined
AND targetKey is currently live in that domain
```

A stale Session, retired generation, removed node, missing baseline, or retired Data
carrier must never produce subsystem input.

### Presentation custom-event payload

The Web Presentation layer should map the node-bound event onto one reserved custom
User Input event channel:

```text
x.loomrealm.web-presentation.event
```

The payload is:

```ts
interface WebPresentationCustomEventPayloadV1 {
  readonly domainId: string;
  readonly targetKey: string;
  readonly name: string;
  readonly data: JsonObject;
}
```

Example Submit payload:

```json
{
  "domainId": "d3",
  "targetKey": "schema-form:12",
  "name": "submit",
  "data": {}
}
```

Example Change payload:

```json
{
  "domainId": "d3",
  "targetKey": "schema-form:12",
  "name": "change",
  "data": {
    "values": {
      "name": "Alice",
      "age": null,
      "enabled": false,
      "class": "mage"
    }
  }
}
```

Schema Form emits outward events only from the root `lr-schema-form` RenderNode.
Field components communicate with that root locally.

The Web Component supplies only `name` and `data`. The Renderer supplies
`domainId` and `targetKey`.

### Reuse of User Input

No new Renderer↔Subsystem wire protocol is required.

The reserved presentation event channel uses the existing User Input custom-channel
mechanism:

```text
Web Component
    ↓
context.emitCustomEvent(...)
    ↓
WebProjector identity-bound capability
    ↓
Renderer currentness validation
    ↓
RendererInputGate
    ↓
x.loomrealm.web-presentation.event
    ↓
existing Renderer Data / User Input transport
    ↓
Subsystem InputManager
    ↓
scope.createInputListener(...)
    ↓
Schema Form module
```

The following remain unchanged:

- Renderer Data connection framing;
- `input.event` wire shape;
- Main-owned InputTarget / Activation authority;
- Subsystem `InputListener` delivery semantics;
- Render Update direction and authority.

### Targeted Renderer input delivery

Ordinary physical `RendererInputSource` events such as keyboard/pointer/gamepad are
Renderer-wide producer observations.

A Web Presentation custom event is different because its source subsystem is already
known from the projected RenderNode.

Therefore the Renderer input gate should support a targeted event operation,
conceptually:

```ts
emitEventForSubsystem(
  subsystemKey: string,
  channel: InputEventChannelV1,
  payload: InputEventV1["payload"],
): void;
```

This method must inspect only the matching subsystem slot.

The event is delivered only if that subsystem currently has:

```text
a valid InputTarget lease
AND current Activation
AND interest in x.loomrealm.web-presentation.event
AND producer availability for that channel
```

If the RenderNode belongs to subsystem A while subsystem B owns the current
InputTarget, the event from A is dropped rather than redirected to B.

This is why Presentation custom events should not be flattened into the existing
global `RendererInputSource.emitEvent()` path before subsystem identity is checked.

### Renderer-local producer availability

The Presentation custom-event channel is a Renderer-owned producer capability, not a
physical platform input source.

Renderer input gating should therefore distinguish physical-source availability from
Renderer-local producer availability.

Conceptually:

```text
physical source availability
  keyboard / pointer / gamepad

Renderer-local availability
  x.loomrealm.web-presentation.event
```

The effective producer check may treat a channel as available when either the
appropriate physical source or the appropriate Renderer-local producer is available.

Resetting/restarting the external physical `RendererInputSource` must not
accidentally clear the Window-local Presentation custom-event capability.

### Event argument validation

`emitCustomEvent()` is a business presentation boundary and must validate before
entering the Renderer input publisher.

It must reject or locally contain invalid values rather than allowing an invalid
payload to reach Data serialization.

At minimum:

```text
name
  non-empty valid Unicode string
  bounded consistently with presentation/input identifiers

data
  plain JSON object
  no DOM/Host objects
  no class instances
  no undefined / Function / Symbol / BigInt
  no NaN / Infinity
  no cycles
  bounded by existing User Input payload depth/member/byte limits
```

The complete payload, including Renderer-added `domainId`, `targetKey`, and
`name`, must satisfy existing User Input payload limits before publication.

The implementation should reuse or expose the existing Data/Wire JSON payload
validation semantics instead of creating an incompatible duplicate validator.

The Renderer must snapshot/detach the accepted JSON data so later mutation by the
Web Component cannot alter an already accepted event.

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

### Implementation impact

The intended LoomRealm implementation changes are narrowly scoped:

```text
packages/renderer/src/internal/web-projector.ts
  keep one shared PresentationResourceClient
  inject one identity-bound WebPresentationContext per LiveElement
  add emitCustomEvent directly to the existing context shape

packages/renderer/src/internal/presentation-seam.ts
  add Renderer-internal presentation-event forwarding capability

packages/renderer/src/control.ts
  validate current Session/subsystem/generation/store target
  forward targeted presentation event into InputGate

packages/renderer/src/internal/render-store.ts
  expose a readonly current-target check for domainId/targetKey

packages/renderer/src/internal/input-gate.ts
  support targeted subsystem events
  support Renderer-local producer availability

packages/data / wire-facing helpers
  expose/reuse bounded JSON input-payload validation if needed
  keep existing input.event wire schema unchanged
```

Desktop/PWA platform composition does not need a second presentation-specific Data
connection and does not need a reverse Render transport.

The existing Renderer presentation attachment is sufficient to connect WebProjector
to Renderer-owned capability handling.

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
  zIndex: 100,
  roots: [{
    key: "schema-form:12",
    tag: "lr-schema-form",
    attrs: {},
    data: {
      title: "Character",
      cancelable: true,
    },
    children: [
      {
        key: "field:name",
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
        key: "field:age",
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
