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
export type SchemaFormDataV1 =
  Readonly<Record<string, JsonValue>>;

export interface SchemaFormRequestV1 {
  readonly schema: SchemaFormV1;
  readonly initialValue?: SchemaFormDataV1;
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
});

if (result.type === "submitted") {
  // consume result.value
}
```

The public function is a convenience module API, not a service locator and not a
wrapper around `frame.call()`.

A Builder/Handler abstraction is intentionally not introduced in v1. The interaction
has a simple one-shot lifetime:

```text
open → edit → submit/cancel → return
```

If future requirements introduce a persistent control surface that survives beyond
one interaction, that API shape can be reconsidered separately.

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

`false` is an explicit value and must never be treated as absent.

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
absent
```

Therefore:

```text
initialValue > default > absent
```

No additional `initial`, `value`, or `defaultValue` aliases are defined in v1.

## Value semantics

Submitted form data is a plain object keyed by field key.

Example:

```json
{
  "name": "Alice",
  "level": 10,
  "enabled": false,
  "class": "mage"
}
```

Optional fields with no value are omitted.

The following values are explicit values, not absence:

```text
false
0
""
```

For required string fields, an empty string does not satisfy `required`.

For select fields, submitted values must exactly match one declared
`options[*].value`.

Schema Form does not perform implicit trimming, case folding, Unicode normalization,
locale number conversion, or other value normalization in v1.

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

If validator compilation or execution throws, or if a validator returns an invalid
result shape, that is a schema/program failure rather than a user-data validation
failure.

It must not be converted into an ordinary field error.

A stable module error code should be used, for example:

```text
SCHEMA_FORM_VALIDATOR_FAILED
SCHEMA_FORM_INVALID_VALIDATOR_RESULT
```

The exact failure-code contract is frozen with the module lifecycle/error contract,
not by this document.

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
