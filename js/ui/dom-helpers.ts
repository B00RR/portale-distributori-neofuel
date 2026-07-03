/**
 * Shared DOM helper utilities.
 *
 * These helpers build plain DOM elements imperatively. Inputs are expected to be
 * hardcoded, trusted strings (e.g. CSS classes, element ids); never pass raw user
 * input into `createIcon.className` or `createEl.options.text` without prior
 * sanitization/validation.
 */

/** Create a `<i>` element with the given icon CSS classes. */
export function createIcon(className: string): HTMLElement {
  const icon = document.createElement('i');
  icon.className = className;
  return icon;
}

/** Create a DOM element of the given tag with optional id, classes, text, attributes, dataset, style, children and input helpers. */
export function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: {
    id?: string;
    classes?: string[];
    text?: string;
    attrs?: Record<string, string>;
    dataset?: Record<string, string>;
    style?: Record<string, string>;
    children?: (HTMLElement | Node)[];
    type?: string;
    value?: string;
    required?: boolean;
    placeholder?: string;
    name?: string;
  } = {}
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (options.id) {
    el.id = options.id;
  }
  if (options.classes) {
    el.classList.add(...options.classes.filter(Boolean));
  }
  if (options.text !== undefined) {
    el.textContent = options.text;
  }
  if (options.attrs) {
    Object.entries(options.attrs).forEach(([key, value]) => {
      el.setAttribute(key, value);
    });
  }
  if (options.dataset) {
    Object.entries(options.dataset).forEach(([key, value]) => {
      el.setAttribute(`data-${key}`, value);
    });
  }
  if (options.style) {
    Object.entries(options.style).forEach(([key, value]) => {
      el.style.setProperty(key, value);
    });
  }
  if (options.children) {
    options.children.forEach(child => el.appendChild(child));
  }
  if (options.type !== undefined && tag === 'input') {
    (el as HTMLInputElement).type = options.type;
  }
  if (options.name !== undefined) {
    el.setAttribute('name', options.name);
  }
  if (options.placeholder !== undefined) {
    el.setAttribute('placeholder', options.placeholder);
  }
  if (options.required) {
    el.setAttribute('required', '');
  }
  if (options.value !== undefined && (tag === 'input' || tag === 'textarea' || tag === 'select')) {
    (el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value = options.value;
  }
  return el;
}
