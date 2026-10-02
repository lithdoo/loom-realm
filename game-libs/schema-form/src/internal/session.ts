import { WEB_PRESENTATION_EVENT_CHANNEL_V1 } from "@loomrealm/data";
import type {
  Frame,
  InputListener,
  RenderDomain,
  RenderDomainState,
  SubsystemScope,
  Unsubscribe,
} from "@loomrealm/subsystem";
import type {
  SchemaFormDataV1,
  SchemaFormFieldRenderDataV1,
  SchemaFormRequestV1,
  SchemaFormResultV1,
  SchemaFormV1,
  SchemaFormValueV1,
} from "../model.js";
import { SchemaFormError } from "../model.js";
import {
  builtInErrors,
  canonicalInitial,
  compileValidators,
  isEmptyData,
  ownDataObject,
  runValidator,
  validateEventData,
  validateInitialValue,
  validateSchema,
  type CompiledValidator,
  type CompiledValidators,
} from "./validation.js";

const activeForms = new WeakMap<Frame, Session>();
const THEME_CLASSES =
  "wa-theme-default wa-palette-default wa-brand-blue wa-neutral-gray " +
  "wa-success-green wa-warning-yellow wa-danger-red";
const SCHEMA_FORM_Z_INDEX = 2_147_483_647;
let nextFormSerial = 1;

function isAbortSignal(value: unknown): value is AbortSignal {
  return value !== null && typeof value === "object" &&
    typeof (value as AbortSignal).aborted === "boolean" &&
    typeof (value as AbortSignal).addEventListener === "function" &&
    typeof (value as AbortSignal).removeEventListener === "function";
}

function validateOuter(scope: unknown, frame: unknown, request: unknown): asserts scope is SubsystemScope {
  if (scope === null || typeof scope !== "object" ||
      typeof (scope as SubsystemScope).createRenderDomain !== "function" ||
      typeof (scope as SubsystemScope).createInputListener !== "function") {
    throw new TypeError("Invalid SubsystemScope");
  }
  if (frame === null || typeof frame !== "object" || !isAbortSignal((frame as Frame).signal)) {
    throw new TypeError("Invalid Frame");
  }
  if (request === null || typeof request !== "object" || Array.isArray(request)) {
    throw new TypeError("Invalid SchemaFormRequestV1");
  }
  const cancelable = (request as { cancelable?: unknown }).cancelable;
  if (cancelable !== undefined && typeof cancelable !== "boolean") throw new TypeError("Invalid cancelable");
}

function allocateSerial(): number {
  if (!Number.isSafeInteger(nextFormSerial)) throw new Error("Schema Form identity space exhausted");
  const serial = nextFormSerial;
  nextFormSerial += 1;
  return serial;
}

function abortError(): Error {
  if (typeof DOMException === "function") return new DOMException("The Frame was aborted", "AbortError");
  const error = new Error("The Frame was aborted");
  error.name = "AbortError";
  return error;
}

function fieldRenderData(
  field: SchemaFormV1["fields"][number],
  canonical: SchemaFormDataV1,
  errors: Readonly<Record<string, string>>,
): SchemaFormFieldRenderDataV1 {
  const error = Object.hasOwn(errors, field.key) ? errors[field.key] : undefined;
  const base = {
    key: field.key,
    label: field.label,
    ...(field.description === undefined ? {} : { description: field.description }),
    required: field.required === true,
    ...(error === undefined ? {} : { error }),
  };
  if (field.kind === "string") return {
    ...base,
    kind: "string",
    value: canonical[field.key] as string,
    ...(field.placeholder === undefined ? {} : { placeholder: field.placeholder }),
    multiline: field.multiline === true,
    ...(field.minLength === undefined ? {} : { minLength: field.minLength }),
    ...(field.maxLength === undefined ? {} : { maxLength: field.maxLength }),
  };
  if (field.kind === "number") return {
    ...base,
    kind: "number",
    ...(Object.hasOwn(canonical, field.key) ? { value: canonical[field.key] as number } : {}),
    ...(field.min === undefined ? {} : { min: field.min }),
    ...(field.max === undefined ? {} : { max: field.max }),
    integer: field.integer === true,
  };
  if (field.kind === "boolean") return {
    ...base,
    kind: "boolean",
    value: canonical[field.key] as boolean,
  };
  return {
    ...base,
    kind: "select",
    ...(Object.hasOwn(canonical, field.key) ? { value: canonical[field.key] as string } : {}),
    options: field.options.map((option) => ({ ...option })),
  };
}

function initialState(
  schema: SchemaFormV1,
  canonical: SchemaFormDataV1,
  request: SchemaFormRequestV1,
  serial: number,
): RenderDomainState {
  return {
    zIndex: SCHEMA_FORM_Z_INDEX,
    roots: [{
      key: `sf:${serial}`,
      tag: "lr-schema-form",
      attrs: { class: THEME_CLASSES },
      data: {
        ...(schema.title === undefined ? {} : { title: schema.title }),
        ...(schema.description === undefined ? {} : { description: schema.description }),
        cancelable: request.cancelable === true,
      },
      children: schema.fields.map((field, index) => ({
        key: `sf:${serial}:f:${index}`,
        tag: "lr-schema-form-field",
        attrs: {},
        data: fieldRenderData(field, canonical, {}) as never,
        children: [],
      })),
    }],
  };
}

class Session {
  readonly rootKey: string;
  private canonical: Record<string, SchemaFormValueV1>;
  private errors: Record<string, string> = {};
  private fieldRender: SchemaFormFieldRenderDataV1[];
  private domain?: RenderDomain;
  private listener?: InputListener;
  private unsubscribe?: Unsubscribe;
  private settled = false;
  private resolve!: (value: SchemaFormResultV1) => void;
  private reject!: (cause: unknown) => void;
  readonly result: Promise<SchemaFormResultV1>;
  private readonly abort = (): void => this.finishReject(abortError());

  constructor(
    private readonly scope: SubsystemScope,
    private readonly frame: Frame,
    private readonly request: SchemaFormRequestV1,
    private readonly schema: SchemaFormV1,
    initial: Record<string, SchemaFormValueV1>,
    private readonly validators: CompiledValidators,
    private readonly serial: number,
    private readonly state: RenderDomainState,
  ) {
    this.rootKey = `sf:${serial}`;
    this.canonical = initial;
    this.fieldRender = schema.fields.map((field) => fieldRenderData(field, initial, {}));
    this.result = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }

  start(): Promise<SchemaFormResultV1> {
    try {
      this.domain = this.scope.createRenderDomain(this.state);
      this.listener = this.scope.createInputListener({
        frame: this.frame,
        channels: [WEB_PRESENTATION_EVENT_CHANNEL_V1],
      });
      this.unsubscribe = this.listener.on(WEB_PRESENTATION_EVENT_CHANNEL_V1, (payload) => this.receive(payload));
      this.frame.signal.addEventListener("abort", this.abort, { once: true });
      if (this.frame.signal.aborted) this.abort();
    } catch (cause) {
      this.finishReject(cause);
    }
    return this.result;
  }

  private receive(payload: unknown): void {
    if (this.settled || !ownDataObject(payload) || payload.targetKey !== this.rootKey || typeof payload.name !== "string") return;
    const data = payload.data;
    if (payload.name === "cancel") {
      if (this.request.cancelable === true && isEmptyData(data)) this.finishResolve({ type: "cancelled" });
      return;
    }
    if (payload.name !== "change" && payload.name !== "submit") return;
    const candidate = validateEventData(data, this.schema);
    if (candidate === null) return;
    try {
      if (payload.name === "change") {
        this.applyCandidate(candidate, this.validators.change, "schema.validateOnChange", false);
      } else {
        this.applyCandidate(candidate, this.validators.submit, "schema.validateOnSubmit", true);
      }
    } catch (cause) {
      this.finishReject(cause);
    }
  }

  private applyCandidate(
    candidate: Record<string, SchemaFormValueV1>,
    validator: CompiledValidator | undefined,
    path: "schema.validateOnChange" | "schema.validateOnSubmit",
    submit: boolean,
  ): void {
    const builtIn = builtInErrors(this.schema, candidate);
    const scripted = runValidator(validator, candidate, this.schema, path);
    const errors = { ...scripted, ...builtIn };
    if (submit && Object.keys(errors).length === 0) {
      this.canonical = candidate;
      this.finishResolve({ type: "submitted", value: Object.freeze({ ...candidate }) });
      return;
    }
    this.canonical = candidate;
    this.errors = errors;
    this.refresh();
  }

  private refresh(): void {
    const optional = ["description", "error", "placeholder", "minLength", "maxLength", "min", "max", "value"];
    const nextRender = this.schema.fields.map((field) => fieldRenderData(field, this.canonical, this.errors));
    this.domain?.update({
      nodes: nextRender.map((renderData, index) => {
        const data = renderData as unknown as Record<string, unknown>;
        const previous = this.fieldRender[index] as unknown as Record<string, unknown>;
        const remove = optional.filter((key) => Object.hasOwn(previous, key) && !Object.hasOwn(data, key));
        return {
          key: `sf:${this.serial}:f:${index}`,
          data: {
            set: data as never,
            ...(remove.length === 0 ? {} : { remove }),
          },
        };
      }),
    });
    this.fieldRender = nextRender;
  }

  private cleanup(): void {
    const operations = [
      () => this.unsubscribe?.(),
      () => this.listener?.close(),
      () => this.domain?.close(),
      () => this.frame.signal.removeEventListener("abort", this.abort),
      () => { if (activeForms.get(this.frame) === this) activeForms.delete(this.frame); },
    ];
    for (const operation of operations) {
      try { operation(); } catch { /* best-effort cleanup */ }
    }
  }

  private finishResolve(value: SchemaFormResultV1): void {
    if (this.settled) return;
    this.settled = true;
    this.cleanup();
    this.resolve(value);
  }

  private finishReject(cause: unknown): void {
    if (this.settled) return;
    this.settled = true;
    this.cleanup();
    this.reject(cause);
  }
}

export async function openSchemaForm(
  scope: SubsystemScope,
  frame: Frame,
  request: SchemaFormRequestV1,
): Promise<SchemaFormResultV1> {
  validateOuter(scope, frame, request);
  const schema = validateSchema((request as SchemaFormRequestV1).schema);
  const initial = validateInitialValue(request.initialValue, schema);
  if (activeForms.has(frame)) {
    throw new SchemaFormError("SCHEMA_FORM_ALREADY_OPEN");
  }
  const validators = compileValidators(schema);
  const serial = allocateSerial();
  const canonical = canonicalInitial(schema, initial);
  const state = initialState(schema, canonical, request, serial);
  const session = new Session(scope, frame, request, schema, canonical, validators, serial, state);
  activeForms.set(frame, session);
  return session.start();
}
