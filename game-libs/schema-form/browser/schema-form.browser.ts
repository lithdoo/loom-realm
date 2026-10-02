import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { live } from "lit/directives/live.js";
import "@awesome.me/webawesome/dist/components/input/input.js";
import "@awesome.me/webawesome/dist/components/textarea/textarea.js";
import "@awesome.me/webawesome/dist/components/checkbox/checkbox.js";
import "@awesome.me/webawesome/dist/components/select/select.js";
import "@awesome.me/webawesome/dist/components/option/option.js";
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/dialog/dialog.js";
import type { WebPresentationContext } from "@loomrealm/renderer/web-presentation";
import type {
  SchemaFormFieldRenderDataV1,
  SchemaFormPresentationValueV1,
  SchemaFormPresentationValuesV1,
  SchemaFormRenderDataV1,
} from "../src/model.js";

type DataObject = Record<string, unknown>;

function plainData(value: unknown): value is DataObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  if (Object.getOwnPropertySymbols(value).length !== 0) return false;
  const names = Object.getOwnPropertyNames(value);
  return names.length === Object.keys(value).length && names.every((name) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    return descriptor?.enumerable === true && "value" in descriptor;
  });
}

function exact(value: DataObject, required: readonly string[], optional: readonly string[]): boolean {
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  return required.every((key) => Object.hasOwn(value, key)) && keys.every((key) => allowed.has(key));
}

function finiteOptional(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

function scalarString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

function validateRootData(value: unknown): SchemaFormRenderDataV1 {
  if (!plainData(value) || !exact(value, ["cancelable"], ["title", "description"]) ||
      typeof value.cancelable !== "boolean" ||
      (value.title !== undefined && !scalarString(value.title)) ||
      (value.description !== undefined && !scalarString(value.description))) {
    throw new TypeError("Invalid Schema Form root RenderData");
  }
  return value as unknown as SchemaFormRenderDataV1;
}

function validateFieldData(value: unknown): SchemaFormFieldRenderDataV1 {
  if (!plainData(value) || typeof value.kind !== "string") throw new TypeError("Invalid Schema Form field RenderData");
  const baseRequired = ["key", "kind", "label", "required"];
  const baseOptional = ["description", "error"];
  const kindRequired = value.kind === "string" ? ["value", "multiline"]
    : value.kind === "number" ? ["integer"]
    : value.kind === "boolean" ? ["value"]
    : value.kind === "select" ? ["options"] : [];
  const kindOptional = value.kind === "string" ? ["placeholder", "minLength", "maxLength"]
    : value.kind === "number" ? ["value", "min", "max"]
    : value.kind === "select" ? ["value"] : [];
  if (!["string", "number", "boolean", "select"].includes(value.kind) ||
      !exact(value, [...baseRequired, ...kindRequired], [...baseOptional, ...kindOptional]) ||
      !scalarString(value.key) || !scalarString(value.label) || typeof value.required !== "boolean" ||
      (value.description !== undefined && !scalarString(value.description)) ||
      (value.error !== undefined && (!scalarString(value.error) || value.error.length === 0))) {
    throw new TypeError("Invalid Schema Form field RenderData");
  }
  if (value.kind === "string") {
    if (!scalarString(value.value) || typeof value.multiline !== "boolean" ||
        (value.placeholder !== undefined && !scalarString(value.placeholder)) ||
        (value.minLength !== undefined && (!Number.isInteger(value.minLength) || (value.minLength as number) < 0)) ||
        (value.maxLength !== undefined && (!Number.isInteger(value.maxLength) || (value.maxLength as number) < 0)) ||
        (typeof value.minLength === "number" && typeof value.maxLength === "number" && value.minLength > value.maxLength)) {
      throw new TypeError("Invalid string field RenderData");
    }
  } else if (value.kind === "number") {
    if (typeof value.integer !== "boolean" || !finiteOptional(value.value) || !finiteOptional(value.min) || !finiteOptional(value.max) ||
        (typeof value.min === "number" && typeof value.max === "number" && value.min > value.max)) {
      throw new TypeError("Invalid number field RenderData");
    }
  } else if (value.kind === "boolean") {
    if (typeof value.value !== "boolean") throw new TypeError("Invalid boolean field RenderData");
  } else {
    if (!Array.isArray(value.options) || (value.value !== undefined && typeof value.value !== "string")) {
      throw new TypeError("Invalid select field RenderData");
    }
    const seen = new Set<string>();
    for (const option of value.options) {
      if (!plainData(option) || !exact(option, ["value", "label"], []) ||
          !scalarString(option.value) || !scalarString(option.label) || seen.has(option.value)) {
        throw new TypeError("Invalid select option RenderData");
      }
      seen.add(option.value);
    }
    if (value.value !== undefined && (!scalarString(value.value) || !seen.has(value.value))) throw new TypeError("Invalid select value RenderData");
  }
  return value as unknown as SchemaFormFieldRenderDataV1;
}

function controlValue(event: Event): string {
  const target = event.currentTarget as HTMLElement & { value?: unknown };
  return typeof target.value === "string" ? target.value : "";
}

export class SchemaFormFieldElement extends LitElement {
  static styles = css`
    :host { display: block; min-width: 0; max-width: 100%; }
    .field { min-width: 0; display: grid; gap: .35rem; }
    .label { font-weight: 600; overflow-wrap: anywhere; }
    .required { color: var(--wa-color-danger-60); }
    .hint { color: var(--wa-color-neutral-60); font-size: .875rem; overflow-wrap: anywhere; }
    .error { color: var(--wa-color-danger-60); font-size: .875rem; overflow-wrap: anywhere; }
    wa-input, wa-textarea, wa-select { box-sizing: border-box; min-width: 0; width: 100%; max-width: 100%; }
  `;

  private current?: SchemaFormFieldRenderDataV1;
  private draft = "";
  private dirty = false;

  receiveRenderData(data: Readonly<Record<string, unknown>>): void {
    const validated = validateFieldData(data);
    if (this.current !== undefined && this.current.kind !== validated.kind) throw new TypeError("Schema Form field kind changed");
    if (validated.kind === "number") {
      if (!this.dirty) this.draft = validated.value === undefined ? "" : String(validated.value);
    }
    this.current = validated;
    this.requestUpdate();
  }

  readFormValue(): { readonly key: string; readonly value: SchemaFormPresentationValueV1 } {
    const data = this.current;
    if (data === undefined) throw new TypeError("Schema Form field has no RenderData");
    if (data.kind === "string") {
      const control = this.renderRoot.querySelector("wa-input, wa-textarea") as (HTMLElement & { value?: unknown }) | null;
      return { key: data.key, value: typeof control?.value === "string" ? control.value : data.value };
    }
    if (data.kind === "boolean") {
      const control = this.renderRoot.querySelector("wa-checkbox") as (HTMLElement & { checked?: unknown }) | null;
      return { key: data.key, value: typeof control?.checked === "boolean" ? control.checked : data.value };
    }
    if (data.kind === "number") {
      const lexical = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;
      if (!lexical.test(this.draft)) return { key: data.key, value: null };
      const parsed = Number(this.draft);
      return { key: data.key, value: Number.isFinite(parsed) ? parsed : null };
    }
    const control = this.renderRoot.querySelector("wa-select") as (HTMLElement & { value?: unknown }) | null;
    const token = typeof control?.value === "string" ? control.value : "";
    if (token === "") return { key: data.key, value: null };
    const match = /^o:(0|[1-9][0-9]*)$/.exec(token);
    const index = match === null ? -1 : Number(match[1]);
    return { key: data.key, value: data.options[index]?.value ?? null };
  }

  private changed(event: Event): void {
    const data = this.current;
    if (data === undefined) return;
    if (data.kind === "number") {
      this.draft = controlValue(event);
      this.dirty = true;
    }
    const parent = this.parentElement as (HTMLElement & { fieldChanged?: (field: SchemaFormFieldElement) => void }) | null;
    if (typeof parent?.fieldChanged === "function") parent.fieldChanged(this);
  }

  protected render(): TemplateResult {
    const data = this.current;
    if (data === undefined) return html``;
    return html`
      <div class="field">
        <div class="label">${data.label}${data.required ? html`<span class="required"> *</span>` : nothing}</div>
        ${data.kind === "string" && !data.multiline ? html`
          <wa-input .value=${live(data.value)} .placeholder=${data.placeholder ?? ""} @input=${this.changed}></wa-input>
        ` : nothing}
        ${data.kind === "string" && data.multiline ? html`
          <wa-textarea .value=${live(data.value)} .placeholder=${data.placeholder ?? ""} @input=${this.changed}></wa-textarea>
        ` : nothing}
        ${data.kind === "number" ? html`
          <wa-input type="text" inputmode="decimal" .value=${live(this.draft)} @input=${this.changed}></wa-input>
        ` : nothing}
        ${data.kind === "boolean" ? html`
          <wa-checkbox .checked=${live(data.value)} @change=${this.changed}></wa-checkbox>
        ` : nothing}
        ${data.kind === "select" ? html`
          <wa-select with-clear .value=${live(data.value === undefined ? "" : `o:${data.options.findIndex((option) => option.value === data.value)}`)} @change=${this.changed}>
            ${data.options.map((option, index) => html`<wa-option value=${`o:${index}`}>${option.label}</wa-option>`)}
          </wa-select>
        ` : nothing}
        ${data.description === undefined ? nothing : html`<div class="hint">${data.description}</div>`}
        ${data.error === undefined ? nothing : html`<div class="error" role="alert">${data.error}</div>`}
      </div>
    `;
  }
}

export class SchemaFormElement extends LitElement {
  static styles = css`
    wa-dialog { --width: min(600px, 80vw); --spacing: 0; }
    wa-dialog::part(body) { padding: 0; overflow: hidden; }
    .shell {
      box-sizing: border-box;
      min-width: 0;
      min-height: 0;
      width: 100%;
      max-width: 100%;
      max-height: 80vh;
      overflow: hidden;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
    }
    header, footer { min-width: 0; display: flex; align-items: center; gap: .75rem; padding: 1rem; }
    header { justify-content: space-between; border-bottom: 1px solid var(--wa-color-neutral-30); }
    header h2 { min-width: 0; margin: 0; overflow-wrap: anywhere; }
    .body {
      min-width: 0;
      min-height: 0;
      overflow-x: hidden;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 1rem;
    }
    .description { min-width: 0; margin: 0 0 1rem; color: var(--wa-color-neutral-60); overflow-wrap: anywhere; }
    ::slotted(lr-schema-form-field) { min-width: 0; max-width: 100%; margin-bottom: 1rem; }
    footer { justify-content: flex-end; border-top: 1px solid var(--wa-color-neutral-30); }
    .size-error { min-width: 0; color: var(--wa-color-danger-60); margin-right: auto; overflow-wrap: anywhere; }
  `;

  private context?: WebPresentationContext;
  private current?: SchemaFormRenderDataV1;
  private sizeError = false;
  private previousFocus?: HTMLElement;

  connectedCallback(): void {
    const active = document.activeElement;
    this.previousFocus = active instanceof HTMLElement && active !== document.body && active !== document.documentElement
      ? active
      : undefined;
    super.connectedCallback();
  }

  disconnectedCallback(): void {
    const previousFocus = this.previousFocus;
    this.previousFocus = undefined;
    super.disconnectedCallback();
    queueMicrotask(() => {
      if (previousFocus === undefined || !previousFocus.isConnected ||
          previousFocus.matches(":disabled, [inert], [hidden]") || previousFocus.closest("[inert]") !== null ||
          previousFocus.getClientRects().length === 0) return;
      try { previousFocus.focus({ preventScroll: true }); } catch { /* detached or no longer focusable */ }
    });
  }

  receiveRenderContext(context: WebPresentationContext): void {
    if (context === null || typeof context !== "object" || typeof context.emitCustomEvent !== "function") {
      throw new TypeError("Invalid WebPresentationContext");
    }
    this.context = context;
  }

  receiveRenderData(data: Readonly<Record<string, unknown>>): void {
    this.current = validateRootData(data);
    this.requestUpdate();
  }

  fieldChanged(field: SchemaFormFieldElement): void {
    if (field.parentElement !== this) return;
    this.emitSnapshot("change");
  }

  collectValues(): SchemaFormPresentationValuesV1 {
    const values: Record<string, SchemaFormPresentationValueV1> = {};
    for (const child of Array.from(this.children)) {
      if (!(child instanceof SchemaFormFieldElement)) continue;
      const entry = child.readFormValue();
      Object.defineProperty(values, entry.key, { value: entry.value, enumerable: true, configurable: true, writable: true });
    }
    return values;
  }

  submit(): void { this.emitSnapshot("submit"); }

  cancel(): void {
    if (this.current?.cancelable === true) this.context?.emitCustomEvent("cancel");
  }

  private emitSnapshot(name: "change" | "submit"): void {
    const data = { values: this.collectValues() };
    const fits = new TextEncoder().encode(JSON.stringify(data)).byteLength <= 131_072;
    if (!fits) {
      this.sizeError = true;
      this.requestUpdate();
      return;
    }
    if (this.sizeError) {
      this.sizeError = false;
      this.requestUpdate();
    }
    this.context?.emitCustomEvent(name, data);
  }

  private hideRequested(event: Event): void {
    event.preventDefault();
    if (this.current?.cancelable === true) this.cancel();
  }

  private stop(event: Event): void { event.stopPropagation(); }

  protected render(): TemplateResult {
    const data = this.current;
    const cancelable = data?.cancelable === true;
    return html`
      <wa-dialog open without-header .label=${data?.title ?? "Form"} @wa-hide=${this.hideRequested}
        @keydown=${this.stop} @keyup=${this.stop}
        @pointerdown=${this.stop} @pointermove=${this.stop} @pointerup=${this.stop} @pointercancel=${this.stop}
        @click=${this.stop}>
        <form class="shell" novalidate @submit=${(event: Event) => { event.preventDefault(); this.submit(); }}>
          <header>
            <h2>${data?.title ?? ""}</h2>
            ${cancelable ? html`<wa-button type="button" aria-label="Close" @click=${this.cancel}>Close</wa-button>` : nothing}
          </header>
          <div class="body">
            ${data?.description === undefined ? nothing : html`<p class="description">${data.description}</p>`}
            <slot></slot>
          </div>
          <footer>
            ${this.sizeError ? html`<div class="size-error" role="alert">Form data is too large</div>` : nothing}
            ${cancelable ? html`<wa-button type="button" @click=${this.cancel}>Cancel</wa-button>` : nothing}
            <wa-button type="submit" variant="brand">Submit</wa-button>
          </footer>
        </form>
      </wa-dialog>
    `;
  }
}

if (customElements.get("lr-schema-form") !== undefined || customElements.get("lr-schema-form-field") !== undefined) {
  throw new TypeError("Schema Form custom element collision");
}
customElements.define("lr-schema-form-field", SchemaFormFieldElement);
customElements.define("lr-schema-form", SchemaFormElement);
